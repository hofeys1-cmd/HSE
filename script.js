/* ==================== تنظیمات عمومی ==================== */
// PIN ادمین: برای حالت GitHub Pages فقط یک قفل سبک است.
// پیشنهاد: ریپو را خصوصی نگه دارید یا PIN را قبل از پابلیش تغییر دهید.
const ADMIN_PIN = '2580';

// کلید ذخیره محلی
const STORE_KEY = 'hseApp_store_v1';

// حالت‌ها
let isAdmin = false;

// مدل داده
let store = {
  contractors: [], // {id,name,year,ceo,hse,safetyApproved,safetyExpire,contracts:[],insurances:[]}
  events: [],      // {id,contractorId,type,place,date,time,injury,damage,clinic,desc,meeting,createdAt}
  fines: [],       // {id,contractorId,no,date,amount,desc,expert}
  nonconfs: []     // {id,contractorId,no,date,desc,expert}
};

/* ==================== کمکی‌ها ==================== */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const uid = () => Math.random().toString(36).slice(2,9);

function saveLocal(){ localStorage.setItem(STORE_KEY, JSON.stringify(store)); }
function loadLocal(){
  try{ const raw = localStorage.getItem(STORE_KEY); if(raw) store = JSON.parse(raw); }catch(e){ console.warn(e); }
}

// تلاش برای بارگذاری داده اولیه از data.json (اختیاری)
async function loadSeed(){
  try{
    const resp = await fetch('data.json', { cache:'no-store' });
    if(!resp.ok) return;
    const data = await resp.json();
    // اگر لوکال خالی بود، از seed استفاده کن
    if(store.contractors.length===0 && data.contractors){ store.contractors = data.contractors; }
    if(store.events.length===0 && data.events){ store.events = data.events; }
    if(store.fines.length===0 && data.fines){ store.fines = data.fines; }
    if(store.nonconfs.length===0 && data.nonconfs){ store.nonconfs = data.nonconfs; }
  }catch(e){ /* فایل seed اختیاری است */ }
}

function toast(msg){ alert(msg); }

/* ==================== تب‌ها و جستجو ==================== */
function switchTab(name){
  $$('.tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===name));
  ['dashboard','contractors','events','compliance','reports'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.classList.toggle('hidden', id!==name);
  });
  if(name==='dashboard') renderDashboard();
  if(name==='contractors') { renderContractors(); refreshContractorOptions(); }
  if(name==='events') { refreshContractorOptions(); renderEvents(); }
  if(name==='compliance') { refreshContractorOptions(); renderCompliance(); }
}
$$('.tab').forEach(btn=>btn.addEventListener('click',()=>switchTab(btn.dataset.tab)));

$('#searchInput').addEventListener('input', ()=> renderSearch());

/* ==================== تقویم شمسی ==================== */
function initJalali(){
  $$('.jdate').forEach(inp=>{
    if(inp.dataset.pickerInit) return;
    inp.dataset.pickerInit='1';
    $(inp).setAttribute?.('autocomplete','off');
    jQuery(inp).persianDatepicker({
      initialValue: false, format: 'YYYY/MM/DD', autoClose: true,
      calendarType: 'persian', toolbox: { todayButton:{ enabled:true, text:'امروز' } }
    });
  });
}
// محاسبه روزهای باقیمانده تا تاریخ شمسی
function daysUntil(dateStr){
  try{
    const target = new persianDate().parseFormat(dateStr,'YYYY/MM/DD');
    const t = new persianDate(target).toDate().getTime();
    const now = new Date().getTime();
    return Math.ceil((t - now) / (1000*60*60*24));
  }catch(e){ return null; }
}
// افزودن روز به تاریخ شمسی
function addDays(dateStr, days){
  try{
    const pd = new persianDate().parseFormat(dateStr,'YYYY/MM/DD');
    return new persianDate(pd).add('days', days).format('YYYY/MM/DD');
  }catch(e){ return null; }
}

/* ==================== ورود/خروج ادمین ==================== */
function setAdminMode(flag){
  isAdmin = flag;
  $('#roleBadge').textContent = isAdmin ? 'حالت ادمین' : 'حالت مشاهده';
  $('#roleBadge').className = isAdmin ? 'badge b-green' : 'badge b-cyan';
  $('#adminLoginBtn').classList.toggle('hidden', isAdmin);
  $('#adminLogoutBtn').classList.toggle('hidden', !isAdmin);
  $$('.editor-only').forEach(el=> el.classList.toggle('hidden', !isAdmin));
  sessionStorage.setItem('isAdmin', isAdmin ? '1':'0');
}

$('#adminLoginBtn').addEventListener('click', ()=>{
  const pin = prompt('PIN ادمین را وارد کنید:');
  if(pin===ADMIN_PIN){ setAdminMode(true); toast('وارد شدید'); }
  else if(pin){ toast('PIN نادرست است'); }
});
$('#adminLogoutBtn').addEventListener('click', ()=>{
  setAdminMode(false); toast('خارج شدید');
});

/* ==================== پیمانکاران ==================== */
function toggleSafety(){
  $('#c_safetyDateWrap').classList.toggle('hidden', $('#c_safetyApproved').value!=='yes');
}
$('#c_safetyApproved').addEventListener('change', toggleSafety);

function addContractRow(pref={}){
  const host = $('#contractsList');
  if(host.classList.contains('muted')){ host.classList.remove('muted'); host.innerHTML=''; }
  const row = document.createElement('div');
  row.className='card';
  row.style.marginTop='10px';
  row.innerHTML = `
    <div class="grid">
      <div class="col-6 field"><label>نام پروژه</label><input data-k="project" value="${pref.project||''}" placeholder="مثلاً: احداث خط ۲"></div>
      <div class="col-6 field"><label>شرح کلی فعالیت پروژه</label><input data-k="summary" value="${pref.summary||''}" placeholder="شرح کلی"></div>
      <div class="col-6 field"><label>نام مدیر پروژه</label><input data-k="pm" value="${pref.pm||''}"></div>
      <div class="col-6 field"><label>نام سرپرست کارگاه</label><input data-k="supervisor" value="${pref.supervisor||''}"></div>
    </div>
    <div class="grid">
      <div class="col-6 field"><label>تاریخ شروع پیمان</label><input data-k="start" class="jdate" value="${pref.start||''}"></div>
      <div class="col-6 field"><label>تاریخ پایان پیمان</label><input data-k="end" class="jdate" value="${pref.end||''}"></div>
    </div>
    <div class="field"><label><input type="checkbox" data-k="renew" ${pref.renew?'checked':''}> تمدید قرارداد</label></div>
    <div class="grid renew-wrap ${pref.renew? '':'hidden'}">
      <div class="col-4 field"><label>تاریخ تمدید</label><input data-k="renewDate" class="jdate" value="${pref.renewDate||''}"></div>
      <div class="col-4 field"><label>تاریخ پایان (پس از تمدید)</label><input data-k="renewEnd" class="jdate" value="${pref.renewEnd||''}"></div>
      <div class="col-4 field"><label>الحاقیه‌ها</label><input data-k="attachments" value="${pref.attachments||''}" placeholder="شماره/شرح"></div>
    </div>
    <div class="toolbar">
      <span class="badge b-cyan">پیمان</span>
      <div class="spacer"></div>
      <button class="btn secondary editor-only" type="button" onclick="this.closest('.card').remove()">حذف</button>
    </div>
  `;
  $('#contractsList').appendChild(row);
  const renewCb = row.querySelector('input[data-k="renew"]');
  renewCb.addEventListener('change',()=> row.querySelector('.renew-wrap').classList.toggle('hidden', !renewCb.checked));
  initJalali();
}
function addInsuranceRow(pref={}){
  const host = $('#insList');
  if(host.classList.contains('muted')){ host.classList.remove('muted'); host.innerHTML=''; }
  const row = document.createElement('div');
  row.className='card';
  row.style.marginTop='10px';
  row.innerHTML = `
    <div class="grid">
      <div class="col-4 field"><label>نوع بیمه‌نامه</label>
        <select data-k="type">
          <option ${pref.type==='ماشین آلات'?'selected':''}>ماشین آلات</option>
          <option ${pref.type==='تمام خطر'?'selected':''}>تمام خطر</option>
          <option ${pref.type==='مسئولیت مدنی'?'selected':''}>مسئولیت مدنی</option>
        </select>
      </div>
      <div class="col-4 field"><label>تاریخ شروع</label><input data-k="start" class="jdate" value="${pref.start||''}"></div>
      <div class="col-4 field"><label>مدت اعتبار (روز)</label><input data-k="duration" type="number" min="1" class="mono" value="${pref.duration||''}" placeholder="مثلاً 365"></div>
    </div>
    <div class="toolbar">
      <span class="badge b-amber">بیمه</span>
      <div class="spacer"></div>
      <button class="btn secondary editor-only" type="button" onclick="this.closest('.card').remove()">حذف</button>
    </div>
  `;
  $('#insList').appendChild(row);
  initJalali();
}
function gatherContracts(){
  return Array.from($('#contractsList').children).map(card=>{
    const g = k=> card.querySelector(`[data-k="${k}"]`);
    return {
      project: g('project')?.value?.trim()||'', summary: g('summary')?.value?.trim()||'',
      pm: g('pm')?.value?.trim()||'', supervisor: g('supervisor')?.value?.trim()||'',
      start: g('start')?.value?.trim()||'', end: g('end')?.value?.trim()||'',
      renew: g('renew')?.checked||false, renewDate: g('renewDate')?.value?.trim()||'',
      renewEnd: g('renewEnd')?.value?.trim()||'', attachments: g('attachments')?.value?.trim()||''
    }
  });
}
function gatherInsurances(){
  return Array.from($('#insList').children).map(card=>{
    const g = k=> card.querySelector(`[data-k="${k}"]`);
    return { type: g('type')?.value||'', start: g('start')?.value||'', duration: Number(g('duration')?.value||0) }
  });
}
function resetContractorForm(){
  $('#c_name').value=''; $('#c_year').value=''; $('#c_ceo').value=''; $('#c_hse').value='';
  $('#c_safetyApproved').value='no'; $('#c_safetyExpire').value=''; toggleSafety();
  $('#contractsList').innerHTML='هیچ پیمانی افزوده نشده است.'; $('#contractsList').classList.add('muted');
  $('#insList').innerHTML='هیچ بیمه‌نامه‌ای افزوده نشده است.'; $('#insList').classList.add('muted');
}

function saveContractor(){
  if(!isAdmin){ toast('دسترسی ثبت ندارید'); return; }
  const name = $('#c_name').value.trim();
  if(!name){ toast('نام شرکت را وارد کنید'); return; }
  const c = {
    id: uid(),
    name,
    year: $('#c_year').value ? Number($('#c_year').value) : null,
    ceo: $('#c_ceo').value.trim(),
    hse: $('#c_hse').value.trim(),
    safetyApproved: $('#c_safetyApproved').value==='yes',
    safetyExpire: $('#c_safetyExpire').value.trim() || null,
    contracts: gatherContracts(),
    insurances: gatherInsurances()
  };
  store.contractors.push(c);
  saveLocal();
  resetContractorForm();
  renderContractors();
  refreshContractorOptions();
  renderDashboard();
  toast('پیمانکار ثبت شد');
}

function renderContractors(){
  const wrap = $('#contractorsTableWrap');
  if(store.contractors.length===0){ wrap.innerHTML='<div class="muted">هنوز پیمانکاری ثبت نشده است.</div>'; return; }
  const rows = store.contractors.map(c=>{
    const cnt = c.contracts?.length||0;
    const badge = c.safetyApproved
      ? `<span class="badge b-green">دارای تایید ${c.safetyExpire? 'تا '+c.safetyExpire:''}</span>`
      : `<span class="badge b-red">فاقد تایید</span>`;
    return `<tr>
      <td><strong>${c.name}</strong><div class="muted" style="font-size:12px">${c.hse? 'مسئول HSE: '+c.hse:''}</div></td>
      <td>${badge}</td>
      <td><span class="badge b-cyan">پیمان‌ها: ${cnt}</span></td>
      <td class="mono">${c.year||''}</td>
      <td class="mono">${c.ceo||''}</td>
    </tr>`;
  }).join('');
  wrap.innerHTML = `
    <table>
      <thead><tr><th>نام شرکت</th><th>صلاحیت ایمنی</th><th>پیمان‌ها</th><th>سال تاسیس</th><th>مدیرعامل</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/* ==================== رویدادها ==================== */
function toggleInjury(){ $('#injurySection').classList.toggle('hidden', $('#e_hasInjury').value!=='yes'); }
$('#e_hasInjury').addEventListener('change', toggleInjury);
function toggleDamage(){ const s = $('#e_hasDamage').value==='yes'; $('#damageLevelWrap').classList.toggle('hidden', !s); $('#damageDescWrap').classList.toggle('hidden', !s); }
$('#e_hasDamage').addEventListener('change', toggleDamage);
function toggleClinic(){ const s = $('#e_clinic').value==='yes'; $('#clinicSection').classList.toggle('hidden', !s); }
$('#e_clinic').addEventListener('change', toggleClinic);
function toggleDispatch(){ const s = $('#clinic_result').value==='اعزام'; $('#dispatchWrap').classList.toggle('hidden', !s); }
$('#clinic_result').addEventListener('change', toggleDispatch);
function toggleMeeting(){ const v = $('#e_meetingStatus').value; $('#meetingDateWrap').classList.toggle('hidden', v!=='scheduled'); }
$('#e_meetingStatus').addEventListener('change', toggleMeeting);

function resetEventForm(){
  $('#e_contractor').value = $('#e_contractor').querySelector('option')?.value||'';
  $('#e_type').value='حادثه'; $('#e_place').value=''; $('#e_date').value=''; $('#e_time').value='';
  $('#e_hasInjury').value='no'; toggleInjury();
  $('#i_name').value=''; $('#i_nid').value=''; $('#i_father').value=''; $('#i_birth').value=''; $('#i_hire').value=''; $('#i_phone').value='';
  $('#w1_name').value=''; $('#w1_phone').value=''; $('#w2_name').value=''; $('#w2_phone').value='';
  $('#e_hasDamage').value='no'; toggleDamage(); $('#damageDesc').value='';
  $('#e_clinic').value='no'; toggleClinic(); $('#clinic_date').value=''; $('#clinic_time').value=''; $('#clinic_status').value=''; $('#clinic_actions').value=''; $('#clinic_result').value='بازگشت به کار'; toggleDispatch();
  $('#e_desc').value=''; $('#e_meetingStatus').value='no-need'; toggleMeeting(); $('#meeting_date').value='';
}

function saveEvent(){
  if(!isAdmin){ toast('دسترسی ثبت ندارید'); return; }
  const contractorId = $('#e_contractor').value;
  if(!contractorId){ toast('ابتدا پیمانکار را انتخاب کنید'); return; }
  const e = {
    id: uid(),
    contractorId,
    type: $('#e_type').value,
    place: $('#e_place').value.trim(),
    date: $('#e_date').value.trim(),
    time: $('#e_time').value.trim(),
    injury: ($('#e_hasInjury').value==='yes') ? {
      name: $('#i_name').value.trim(),
      nid: $('#i_nid').value.trim(),
      father: $('#i_father').value.trim(),
      birth: $('#i_birth').value.trim(),
      hire: $('#i_hire').value.trim(),
      phone: $('#i_phone').value.trim(),
      witnesses: [
        {name: $('#w1_name').value.trim(), phone: $('#w1_phone').value.trim()},
        {name: $('#w2_name').value.trim(), phone: $('#w2_phone').value.trim()},
      ]
    } : null,
    damage: ($('#e_hasDamage').value==='yes') ? {
      level: $('#damageLevel').value,
      desc: $('#damageDesc').value.trim()
    } : null,
    clinic: ($('#e_clinic').value==='yes') ? {
      date: $('#clinic_date').value.trim(),
      time: $('#clinic_time').value.trim(),
      status: $('#clinic_status').value.trim(),
      actions: $('#clinic_actions').value.trim(),
      result: $('#clinic_result').value,
      dispatch: ($('#clinic_result').value==='اعزام') ? {
        type: $('#dispatch_type').value, time: $('#dispatch_time').value
      } : null
    } : null,
    desc: $('#e_desc').value.trim(),
    meeting: { status: $('#e_meetingStatus').value, date: $('#meeting_date').value.trim() || null },
    createdAt: Date.now()
  };
  store.events.push(e);
  saveLocal();
  resetEventForm();
  renderEvents();
  renderDashboard();
  toast('رویداد ثبت شد');
}

function renderEvents(){
  const wrap = $('#eventsTableWrap');
  if(store.events.length===0){ wrap.innerHTML='<div class="muted">هنوز رویدادی ثبت نشده است.</div>'; return; }
  const rows = store.events.slice().reverse().map(ev=>{
    const c = store.contractors.find(x=>x.id===ev.contractorId);
    const meetingBadge =
      ev.meeting?.status==='done' ? '<span class="badge b-green">جلسه برگزار شده</span>' :
      ev.meeting?.status==='no-need' ? '<span class="badge b-cyan">نیاز به جلسه نبوده</span>' :
      overdueMeeting(ev.meeting?.date) ? `<span class="badge b-amber">جلسه معوق (${ev.meeting?.date||'-'})</span>` :
      `<span class="badge b-amber">جلسه زمان‌بندی شده (${ev.meeting?.date||'-'})</span>`;
    const inj = ev.injury ? '<span class="badge b-red">خسارت جانی</span>' : '';
    const dmg = ev.damage ? `<span class="badge b-amber">خسارت مالی: ${ev.damage.level}</span>` : '';
    return `
      <tr>
        <td><strong>${c? c.name : '-'}</strong><div class="muted" style="font-size:12px">${ev.place||''}</div></td>
        <td>${ev.type}</td>
        <td class="mono">${ev.date} ${ev.time||''}</td>
        <td>${inj} ${dmg}</td>
        <td>${meetingBadge}</td>
        <td class="no-print">${isAdmin ? `<button class="btn secondary" onclick="viewEvent('${ev.id}')">مشاهده</button>`:''}</td>
      </tr>
    `;
  }).join('');
  wrap.innerHTML = `
    <table>
      <thead>
        <tr><th>پیمانکار</th><th>نوع رویداد</th><th>زمان وقوع</th><th>نتایج</th><th>جلسه</th><th class="no-print">عملیات</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}
function viewEvent(id){
  const ev = store.events.find(e=>e.id===id);
  if(!ev) return;
  const c = store.contractors.find(x=>x.id===ev.contractorId);
  const details = `
پیمانکار: ${c?.name||'-'}
نوع رویداد: ${ev.type}
محل وقوع: ${ev.place||'-'}
تاریخ/ساعت: ${ev.date||'-'} ${ev.time||''}
خسارت جانی: ${ev.injury? 'بله' : 'خیر'}
خسارت مالی: ${ev.damage? (ev.damage.level + ' - ' + (ev.damage.desc||'')) : 'خیر'}
بهداری: ${ev.clinic? (ev.clinic.result + (ev.clinic.dispatch? ' - اعزام با '+ev.clinic.dispatch.type : '')) : 'خیر'}
جلسه: ${ev.meeting.status==='done'?'برگزار شده':ev.meeting.status==='scheduled'?'زمان‌بندی: '+(ev.meeting.date||'-'):'نیازی نبوده'}
شرح: ${ev.desc||'-'}
  `;
  alert(details);
}
function overdueMeeting(dateStr){
  if(!dateStr) return false;
  const d = daysUntil(dateStr);
  return d!==null && d<0;
}

/* ==================== جریمه و عدم انطباق ==================== */
function saveFine(){
  if(!isAdmin){ toast('دسترسی ثبت ندارید
