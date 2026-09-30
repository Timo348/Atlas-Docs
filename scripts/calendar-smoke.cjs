// Runs only against a disposable local Atlas instance; never a production account.
const { chromium } = require(process.env.ATLAS_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const env = Object.fromEntries(fs.readFileSync(process.env.ATLAS_QA_ENV || '.env.qa', 'utf8').split(/\r?\n/).filter(Boolean).map(line => { const i = line.indexOf('='); return [line.slice(0,i),line.slice(i+1)]; }));
const baseURL = env.APP_URL;
assert(['localhost','127.0.0.1','[::1]'].includes(new URL(baseURL).hostname));
const results = [];
const run = Date.now();
fs.mkdirSync('.qa', { recursive:true });
async function login(page,email,password) {
  await page.goto(baseURL+'/signin');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  await page.locator('.signin-card form button').click();
  await page.waitForURL(url => url.pathname === '/');
}
async function request(page,path,data,method='GET',status) {
  const response = await page.request.fetch(baseURL+path,{method,...(data===undefined?{}:{data})});
  const body=await response.text();
  if(status!==undefined) assert.equal(response.status(),status,path+': '+body);
  else assert(response.ok(),path+': '+response.status()+' '+body);
  return body ? JSON.parse(body) : null;
}
async function query(page,params={}) {
  return request(page,'/api/calendar?'+new URLSearchParams({start:'2026-09-01',end:'2026-12-01',today:'2026-09-30',...params}));
}
async function createEntry(page,input) {return (await request(page,'/api/calendar/entries',input,'POST')).entry;}
async function appPreferences(page,update) {
 return request(page,'/api/preferences',{language:'en',colorTheme:'light',uiFont:'inter',editorFont:'mono',fontSize:'medium',defaultEditorView:'write',defaultSpaceId:null,compactMode:false,...update},'PATCH');
}
async function until(fn,description,timeout=30000) {
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){if(await fn())return;await new Promise(r=>setTimeout(r,300));}
  throw new Error('Timed out: '+description);
}
async function noOverflow(page,description,selector) {
 const width=await page.evaluate(selector=>{
  const element=selector?document.querySelector(selector):document.documentElement;
  return {scroll:element.scrollWidth,client:element.clientWidth};
 },selector);
 assert(width.scroll<=width.client+1,description+': '+JSON.stringify(width));
}
async function loadedCalendar(page,personalTitle,spaceName,language='en') {
 await page.locator('.calendar-sidebar-title h1').filter({hasText:language==='de'?'Kalender':'Calendar'}).waitFor({state:'attached'});
 await page.locator('.fc').waitFor();
 await page.locator('.calendar-task-list-undated').getByText(personalTitle,{exact:true}).waitFor();
 await page.locator('.calendar-source').filter({hasText:spaceName}).waitFor({state:'attached'});
}
async function main(){
 const browser=await chromium.launch({headless:true,channel:process.env.ATLAS_BROWSER_CHANNEL || undefined});
 const context=await browser.newContext({viewport:{width:1560,height:1100}});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const extraContexts=[];
 try {
  await login(page,env.ADMIN_EMAIL,env.ADMIN_PASSWORD);
  // Earlier smoke runs may deliberately finish in German/dark mode.
  await appPreferences(page,{language:'en',colorTheme:'light'});
  const session=await request(page,'/api/auth/session');const adminId=session.user.id;
  const password=crypto.randomBytes(20).toString('hex');
  const member=await request(page,'/api/users',{name:'Calendar member '+run,email:'calendar-member-'+run+'@example.test',password},'POST');
  const memberContext=await browser.newContext({viewport:{width:1560,height:1100}});extraContexts.push(memberContext);
  const memberPage=await memberContext.newPage();memberPage.on('pageerror',e=>errors.push(e.message));await login(memberPage,member.email,password);
  await memberPage.goto(baseURL+'/calendar');await memberPage.getByRole('heading',{name:'Calendar',exact:true,level:1}).waitFor();
  const privateItem=await createEntry(memberPage,{kind:'todo',title:'Private member todo '+run,dueDate:'2026-09-30'});
  const other=await query(page);assert(!other.events.some(e=>e.entryId===privateItem.id));
  await request(page,'/api/calendar/entries/'+privateItem.id,{title:'Stolen',revision:privateItem.revision},'PATCH',404);
  await request(page,'/api/calendar/entries/'+privateItem.id,{revision:privateItem.revision},'DELETE',404);
  const foreignExport=await request(page,'/api/calendar/export');assert(!JSON.stringify(foreignExport).includes(privateItem.id));
  const anonymous=await browser.newContext();extraContexts.push(anonymous);const anonymousPage=await anonymous.newPage();
  await request(anonymousPage,'/api/calendar?start=2026-09-01&end=2026-10-01',undefined,'GET',401);
  results.push('Personal calendar without a Space; owner isolation including administrator, foreign mutation IDs and export, anonymous denied');

  const timed=await createEntry(page,{kind:'appointment',title:'DST series '+run,start:'2026-10-24T09:30',end:'2026-10-24T10:30',timeZone:'Europe/Berlin',recurrence:{frequency:'daily',interval:1,count:4}});
  let events=(await query(page)).events.filter(e=>e.entryId===timed.id);
  assert.equal(events.length,4);assert.equal(events[0].start,'2026-10-24T07:30:00Z');assert.equal(events[1].start,'2026-10-25T08:30:00Z');
  const occurrence=events[1];
  await request(page,'/api/calendar/entries/'+timed.id,{revision:timed.revision,scope:'occurrence',occurrenceKey:occurrence.occurrenceKey,title:'One changed occurrence'},'PATCH');
  events=(await query(page)).events.filter(e=>e.entryId===timed.id);assert.equal(events.filter(e=>e.title==='One changed occurrence').length,1);
  await request(page,'/api/calendar/entries/'+timed.id,{revision:timed.revision,title:'Stale draft'},'PATCH',409);
  const split=await request(page,'/api/calendar/entries/'+timed.id,{revision:events[2].revision,scope:'following',occurrenceKey:events[2].occurrenceKey,title:'Following occurrences'},'PATCH');
  const all=(await query(page)).events.filter(e=>e.entryId===timed.id || e.entryId===split.entry.id);
  assert.equal(all.length,4);assert.equal(all.filter(e=>e.title==='Following occurrences').length,2);assert.equal(all[0].title,'DST series '+run);
  results.push('Timed recurrence preserves local time at winter DST, single exception, optimistic revision conflict and following split preserving previous occurrences/count');

  const todo=await createEntry(page,{kind:'todo',title:'Recurring todo '+run,dueDate:'2026-09-30',recurrence:{frequency:'daily',interval:1,count:3}});
  const todoEvents=(await query(page)).events.filter(e=>e.entryId===todo.id);
  await request(page,'/api/calendar/entries/'+todo.id,{revision:todo.revision,scope:'occurrence',occurrenceKey:todoEvents[0].occurrenceKey,completed:true},'PATCH');
  let todoAll=(await query(page,{completed:'true'})).events.filter(e=>e.entryId===todo.id);
  assert.equal(todoAll.filter(e=>e.completed).length,1);assert.equal(todoAll.length,3);
  assert.equal((await query(page)).events.filter(e=>e.entryId===todo.id).length,2);
  await request(page,'/api/calendar/entries/'+todo.id,{revision:todoAll[0].revision,scope:'occurrence',occurrenceKey:todoAll[1].occurrenceKey},'DELETE');
  todoAll=(await query(page,{completed:'true'})).events.filter(e=>e.entryId===todo.id);assert.equal(todoAll.length,2);
  await request(page,'/api/calendar/entries/'+todo.id,{revision:todoAll[0].revision,scope:'following',occurrenceKey:todoAll[1].occurrenceKey},'DELETE');
  assert.equal((await query(page,{completed:'true'})).events.filter(e=>e.entryId===todo.id).length,1);
  results.push('Recurring todo completion and deletion apply per occurrence; following deletion preserves past completion');

  const space=await request(page,'/api/spaces',{name:'Calendar smoke '+run},'POST');
  await request(page,'/api/spaces/'+space.id+'/permissions',{users:[{id:adminId,role:'OWNER'},{id:member.id,role:'VIEWER'}],teams:[]},'PUT');
  const board=await request(page,'/api/pages',{spaceId:space.id,title:'Calendar board QA',format:'TODO'},'POST');
  const {preferences:initialPrefs}=await request(page,'/api/calendar/preferences');assert(initialPrefs.selectedSpaceIds.includes(space.id));
  const token=await request(memberPage,'/api/collaboration-token?pageId='+board.id);assert.equal(token.readOnly,true);
  const members=await request(page,'/api/calendar/spaces/'+space.id+'/members');assert(JSON.stringify(members).includes(member.id));
  await page.goto(baseURL+'/?space='+space.id+'&page='+board.id);await page.getByRole('button',{name:'Add task',exact:true}).waitFor();
  await page.getByRole('button',{name:'Add task',exact:true}).click();let dialog=page.getByRole('dialog');
  await dialog.getByLabel('Task title',{exact:true}).fill('New assigned task '+run);await dialog.getByLabel('Deadline',{exact:true}).fill('2026-09-30');
  await dialog.getByRole('button',{name:'Create task',exact:true}).click();
  let taskEvent;await until(async()=>{taskEvent=(await query(page,{spaces:space.id,scope:'mine'})).events.find(e=>e.title==='New assigned task '+run);return !!taskEvent;},'new board task indexed');
  assert.deepEqual(taskEvent.assigneeIds,[adminId]);
  const viewerEvents=await query(memberPage,{spaces:space.id});assert.equal(viewerEvents.events.find(e=>e.taskId===taskEvent.taskId).canEdit,false);
  assert.equal((await query(memberPage,{spaces:space.id,scope:'mine'})).events.filter(e=>e.taskId===taskEvent.taskId).length,0);
  results.push('New board task creator assignment, SQL index, All/Mine filter, viewer state and assignable members');

  const calendarPage=await context.newPage();calendarPage.on('pageerror',e=>errors.push(e.message));
  await calendarPage.goto(baseURL+'/calendar');
  await calendarPage.getByRole('combobox',{name:'Calendar view'}).selectOption('timeGridDay');
  const calendarTask=calendarPage.locator('.calendar-event-content').filter({hasText:taskEvent.title});
  await calendarTask.first().click();let detail=calendarPage.getByRole('dialog');
  await detail.getByLabel('Description',{exact:true}).fill('  Calendar description with spaces  ');
  await detail.getByLabel('Due date (optional)',{exact:true}).fill('2026-10-01');
  await detail.getByRole('button',{name:'Save',exact:true}).click();await detail.waitFor({state:'hidden',timeout:32000});
  const boardCard=page.locator('.todo-card').filter({hasText:taskEvent.title});
  await until(async()=>await boardCard.getByLabel('Deadline',{exact:true}).inputValue()==='2026-10-01','calendar edit reaches open board');
  const durable=await request(page,'/api/calendar/tasks/'+board.id+'/'+taskEvent.taskId);
  assert.equal(durable.task.description,'Calendar description with spaces');assert.equal(durable.task.deadline,'2026-10-01');
  // Remove the deadline from the still-open board; the calendar moves it into its undated list.
  await boardCard.getByLabel('Deadline',{exact:true}).fill('');
  await until(async()=>await calendarPage.locator('.calendar-task-list-undated').getByText(taskEvent.title,{exact:true}).count()>0,'five-second refresh moves board task to undated list');
  await calendarPage.locator('.calendar-task-list-undated').getByText(taskEvent.title,{exact:true}).click();detail=calendarPage.getByRole('dialog');
  await detail.getByLabel('Title',{exact:true}).fill('Unsaved calendar draft '+run);
  await boardCard.getByRole('button',{name:'Edit task',exact:true}).click();const boardDialog=page.getByRole('dialog');
  await boardDialog.getByLabel('Task title',{exact:true}).fill('Changed in board '+run);await boardDialog.getByRole('button',{name:'Save changes',exact:true}).click();
  await until(async()=>(await request(page,'/api/calendar/tasks/'+board.id+'/'+taskEvent.taskId)).task.title==='Changed in board '+run,'concurrent board edit persisted');
  await detail.getByRole('button',{name:'Save',exact:true}).click();
  await detail.getByRole('alert').filter({hasText:'changed elsewhere'}).waitFor();assert.equal(await detail.getByLabel('Title',{exact:true}).inputValue(),'Unsaved calendar draft '+run);
  await detail.getByRole('button',{name:'Close',exact:true}).last().click();
  // Permit the fresh rights/state read, then hang confirmation reads after the Yjs write.
  // The browser fetch must abort at the shared 30-second deadline and retain the draft.
  await calendarPage.locator('.calendar-task-list-undated').getByText('Changed in board '+run,{exact:true}).waitFor();
  await calendarPage.locator('.calendar-task-list-undated').getByText('Changed in board '+run,{exact:true}).click();detail=calendarPage.getByRole('dialog');
  const retainedTitle='Draft retained after timeout '+run;
  await detail.getByLabel('Title',{exact:true}).fill(retainedTitle);
  const taskRoute='**/api/calendar/tasks/'+board.id+'/'+taskEvent.taskId;
  const hungRoutes=[];let interceptedReads=0;
  const hangConfirmation=async route=>{interceptedReads++;if(interceptedReads===1)await route.continue();else hungRoutes.push(route);};
  await calendarPage.route(taskRoute,hangConfirmation);
  const saveStarted=Date.now();
  try{
   await detail.getByRole('button',{name:'Save',exact:true}).click();
   await detail.getByRole('alert').filter({hasText:'within 30 seconds'}).waitFor({timeout:33000});
   const elapsed=Date.now()-saveStarted;
   assert(elapsed>=28000&&elapsed<=32500,'confirmation timeout should stay bounded: '+elapsed+'ms');
   assert(interceptedReads>=2,'the confirmation read must hang after the initial real state read');
   assert.equal(await detail.getByLabel('Title',{exact:true}).inputValue(),retainedTitle);
   assert.equal(await detail.getByRole('button',{name:'Save',exact:true}).isEnabled(),true);
   results.push('Hanging persisted-task confirmation times out in '+elapsed+'ms and retains the entered browser draft');
  }finally{
   await calendarPage.unroute(taskRoute,hangConfirmation);
   await Promise.all(hungRoutes.map(route=>route.abort().catch(()=>{})));
  }
  await detail.getByRole('button',{name:'Close',exact:true}).last().click();
  await calendarPage.getByRole('button',{name:'New',exact:true}).click();detail=calendarPage.getByRole('dialog');
  await detail.getByRole('button',{name:'Todo',exact:true}).click();await detail.getByLabel('Title',{exact:true}).fill('Created from calendar UI '+run);
  await detail.getByRole('button',{name:'Save',exact:true}).click();await detail.waitFor({state:'hidden'});
  await calendarPage.locator('.calendar-task-list-undated').getByText('Created from calendar UI '+run,{exact:true}).waitFor();
  await calendarPage.close();
  results.push('Open calendar/board sync, normalized description confirmation, deadline removal, concurrent conflict keeps draft, personal creation through UI');

  await request(page,'/api/calendar/preferences',{view:'timeGridWeek',selectedSpaceIds:[],taskScope:'mine',showCompleted:true,timeZone:'Europe/Berlin'},'PATCH');
  const reauth=await browser.newContext();extraContexts.push(reauth);const reauthPage=await reauth.newPage();await login(reauthPage,env.ADMIN_EMAIL,env.ADMIN_PASSWORD);
  const {preferences:saved}=await request(reauthPage,'/api/calendar/preferences');assert.equal(saved.view,'timeGridWeek');assert.deepEqual(saved.selectedSpaceIds,[]);assert.equal(saved.taskScope,'mine');
  const newSpace=await request(page,'/api/spaces',{name:'New visible Space '+run},'POST');
  const {preferences:updatedPrefs}=await request(page,'/api/calendar/preferences');assert(updatedPrefs.selectedSpaceIds.includes(newSpace.id));assert(!updatedPrefs.selectedSpaceIds.includes(space.id));
  await request(page,'/api/calendar/preferences',{view:'dayGridMonth',selectedSpaceIds:[space.id],taskScope:'all',showCompleted:false},'PATCH');
  results.push('Source selection and preferred view persist after a new login; new Spaces become visible');

  // Existing records from the 3.2.0 upgrade fixture are optional for fresh-installs.
  if(fs.existsSync('.qa/legacy-fixtures.json')){
   const fixtures=JSON.parse(fs.readFileSync('.qa/legacy-fixtures.json','utf8'));
   const upgraded=await query(page,{spaces:fixtures.space.id});
   assert(upgraded.events.some(e=>e.title==='Legacy due'&&e.assigneeIds.length===0));
   assert(upgraded.undated.some(e=>e.title==='Legacy undated'));
   const allSources=(await query(page)).spaces.map(source=>source.id).join(',');
   assert((await query(page,{spaces:allSources})).indexWarnings.some(e=>e.pageId==='qa-corrupt-todo'));
   await page.goto(baseURL+'/?space='+fixtures.space.id+'&page='+fixtures.gantt.id);
   await page.locator('.gantt-archive-notice').waitFor();
   results.push('Upgrade keeps legacy unassigned/undated tasks; damaged boards are reported and Gantt opens as an archive');
  }
  await request(page,'/api/spaces/'+space.id+'/permissions',{users:[{id:adminId,role:'OWNER'}],teams:[]},'PUT');
  await request(memberPage,'/api/calendar/tasks/'+board.id+'/'+taskEvent.taskId,undefined,'GET',403);
  await request(memberPage,'/api/calendar?start=2026-09-01&end=2026-12-01&spaces='+space.id,undefined,'GET',403);
  results.push('Revoked Space access is immediately enforced by query/task endpoints');

  await appPreferences(page,{language:'en',colorTheme:'light'});await page.goto(baseURL+'/calendar');
  await loadedCalendar(page,'Created from calendar UI '+run,space.name);
  for(const view of ['dayGridMonth','timeGridWeek','timeGridDay','listMonth']){
   await page.getByRole('combobox',{name:'Calendar view'}).selectOption(view);
   await until(async()=>(await request(page,'/api/calendar/preferences')).preferences.view===view,'view preference '+view);
   await page.getByRole('button',{name:'Today',exact:true}).click();
   const currentTitle=await page.locator('.calendar-toolbar h2').innerText();
   await page.getByRole('button',{name:'Previous period',exact:true}).click();
   await until(async()=>await page.locator('.calendar-toolbar h2').innerText()!==currentTitle,'previous period in '+view);
   await page.getByRole('button',{name:'Next period',exact:true}).click();
   await until(async()=>await page.locator('.calendar-toolbar h2').innerText()===currentTitle,'next returns in '+view);
   await page.getByRole('button',{name:'Next period',exact:true}).click();
   await until(async()=>await page.locator('.calendar-toolbar h2').innerText()!==currentTitle,'next period in '+view);
   await page.getByRole('button',{name:'Today',exact:true}).click();
   await until(async()=>await page.locator('.calendar-toolbar h2').innerText()===currentTitle,'Today returns in '+view);
   await noOverflow(page,'desktop '+view);
  }
  await request(page,'/api/calendar/preferences',{view:'dayGridMonth',selectedSpaceIds:[space.id],taskScope:'all',showCompleted:false},'PATCH');
  results.push('Month, week, day and agenda views persist; Previous/Next/Today update and restore each visible period');

  for(const [language,colorTheme] of [['en','light'],['en','dark'],['de','light'],['de','dark']]){
   await appPreferences(page,{language,colorTheme});await page.goto(baseURL+'/calendar');
   await loadedCalendar(page,'Created from calendar UI '+run,space.name,language);
   await until(async()=>await page.locator('html').getAttribute('data-theme')===colorTheme,'desktop theme applied');
   await page.screenshot({path:'.qa/calendar-'+language+'-'+colorTheme+'.png',fullPage:true});
   await noOverflow(page,'desktop '+language+' '+colorTheme);
  }
  const mobileUser=await request(page,'/api/users',{name:'Mobile calendar '+run,email:'calendar-mobile-'+run+'@example.test',password},'POST');
  const mobileContext=await browser.newContext({viewport:{width:390,height:844}});extraContexts.push(mobileContext);const mobilePage=await mobileContext.newPage();mobilePage.on('pageerror',e=>errors.push(e.message));
  await request(page,'/api/spaces/'+space.id+'/permissions',{users:[{id:adminId,role:'OWNER'},{id:mobileUser.id,role:'VIEWER'}],teams:[]},'PUT');
  await login(mobilePage,mobileUser.email,password);await appPreferences(mobilePage,{language:'en',colorTheme:'light'});
  await mobilePage.goto(baseURL+'/calendar');await mobilePage.locator('.fc').waitFor();
  assert.equal(await mobilePage.getByRole('combobox',{name:'Calendar view'}).inputValue(),'listMonth');
  await mobilePage.getByRole('button',{name:'New',exact:true}).click();let mobileDialog=mobilePage.getByRole('dialog');
  await mobileDialog.getByRole('button',{name:'Todo',exact:true}).click();await mobileDialog.getByLabel('Title',{exact:true}).fill('Mobile UI personal todo '+run);
  await mobileDialog.getByRole('button',{name:'Save',exact:true}).click();await mobileDialog.waitFor({state:'hidden'});
  for(const [language,colorTheme] of [['en','light'],['en','dark'],['de','light'],['de','dark']]){
   await appPreferences(mobilePage,{language,colorTheme});await mobilePage.goto(baseURL+'/calendar');
   await loadedCalendar(mobilePage,'Mobile UI personal todo '+run,space.name,language);
   assert.equal(await mobilePage.getByRole('combobox',{name:language==='de'?'Kalenderansicht':'Calendar view'}).inputValue(),'listMonth');
   await until(async()=>await mobilePage.locator('html').getAttribute('data-theme')===colorTheme,'mobile theme applied');
   await noOverflow(mobilePage,'mobile '+language+' '+colorTheme);
   await mobilePage.screenshot({path:'.qa/calendar-mobile-'+language+'-'+colorTheme+'.png',fullPage:true});
   await mobilePage.getByRole('button',{name:language==='de'?'Quellen anzeigen':'Show sources',exact:true}).click();
   const mobileSources=mobilePage.locator('.calendar-sidebar-open');await mobileSources.waitFor();
   await mobileSources.locator('.calendar-source').filter({hasText:space.name}).waitFor();
   await noOverflow(mobilePage,'mobile source dialog '+language+' '+colorTheme);
   await noOverflow(mobilePage,'mobile source panel '+language+' '+colorTheme,'.calendar-sidebar-open');
   await mobilePage.screenshot({path:'.qa/calendar-mobile-sources-'+language+'-'+colorTheme+'.png',fullPage:true});
   await mobileSources.getByRole('button',{name:language==='de'?'Quellen schließen':'Close sources',exact:true}).click();
   await mobilePage.getByRole('button',{name:language==='de'?'Neu':'New',exact:true}).click();mobileDialog=mobilePage.getByRole('dialog');await mobileDialog.waitFor();
   await mobileDialog.getByLabel(language==='de'?'Beginn':'Start',{exact:true}).waitFor();
   await noOverflow(mobilePage,'mobile appointment page '+language+' '+colorTheme);
   await noOverflow(mobilePage,'mobile appointment dialog '+language+' '+colorTheme,'.calendar-dialog');
   await mobilePage.screenshot({path:'.qa/calendar-mobile-appointment-'+language+'-'+colorTheme+'.png',fullPage:true});
   await mobileDialog.getByRole('button',{name:language==='de'?'Schließen':'Close',exact:true}).last().click();
  }
  results.push('Desktop and mobile each pass English/German and light/dark; loaded sources/private todos visible; mobile agenda, source panel and new appointment dialog have no horizontal overflow');
  assert.deepEqual(errors,[]);
  fs.writeFileSync('.qa/calendar-results.json',JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));
 }catch(e){await page.screenshot({path:'.qa/calendar-failure.png',fullPage:true}).catch(()=>{});throw e;}
 finally{await Promise.all(extraContexts.map(c=>c.close()));await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
