const { chromium } = require(process.env.ATLAS_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const env = Object.fromEntries(fs.readFileSync(process.env.ATLAS_QA_ENV || '.env.qa', 'utf8').split(/\r?\n/).filter(Boolean).map(line => { const i = line.indexOf('='); return [line.slice(0,i),line.slice(i+1)]; }));
const baseURL = env.APP_URL;
assert(['localhost','127.0.0.1','[::1]'].includes(new URL(baseURL).hostname), 'Browser smoke tests require a local disposable instance.');
fs.mkdirSync('.qa', { recursive:true });
const run = Date.now();
const results = [];
async function login(page,email,password) {
  await page.goto(baseURL+'/signin');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  await page.locator('.signin-card form button').click();
  await page.waitForURL(url => url.pathname === '/');
}
async function json(page,path,data,method='post') {
  const response = await page.request[method](baseURL+path,{data});
  assert(response.ok(), path+': '+response.status()+' '+await response.text());
  return response.json();
}
async function value(locator, expected) {
  const deadline = Date.now()+8000;
  while (Date.now()<deadline) {
    if (await locator.inputValue()===expected) return;
    await new Promise(resolve => setTimeout(resolve,50));
  }
  assert.equal(await locator.inputValue(),expected);
}
async function ready(page, selector) {
  await page.waitForFunction(selector => { const el=document.querySelector(selector); return el && !el.readOnly && !el.disabled; },selector);
}
async function runChecks() {
  const browser = await chromium.launch({headless:true,channel:process.env.ATLAS_BROWSER_CHANNEL || undefined});
  const context = await browser.newContext({viewport:{width:1560,height:1100}});
  const page = await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try {
    await login(page,env.ADMIN_EMAIL,env.ADMIN_PASSWORD);
    const space = await json(page,'/api/spaces',{name:'QA Issues '+run});
    const atlas = await json(page,'/api/pages',{spaceId:space.id,title:'AtlasDoc QA',format:'ATLASDOC'});
    const md = await json(page,'/api/pages',{spaceId:space.id,title:'Markdown QA',format:'MARKDOWN'});
    const plain = await json(page,'/api/pages',{spaceId:space.id,title:'Text QA',format:'TEXT'});
    await page.goto(baseURL+'/?space='+space.id+'&page='+atlas.id);
    await ready(page,'.atlasdoc-text-content');
    assert.equal(await page.locator('[class*="triggerCopy"]').count(),0);
    assert.equal(await page.locator('[class*="sidebarIdentity"]').count(),1);
    await page.locator('[class*="sidebarIdentity"]').click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
    results.push('Single navigation space picker opens and closes');

    const text = page.locator('.atlasdoc-text-content').first();
    await text.fill('');
    await page.waitForTimeout(600);
    await text.pressSequentially('hallo',{delay:45});
    await value(text,'hallo');
    await text.press('Control+z'); await value(text,'');
    await text.press('Control+y'); await value(text,'hallo');
    await text.press('Home'); await text.press('ArrowRight'); await text.press('ArrowRight');
    await text.pressSequentially('X'); await value(text,'haXllo');
    await text.press('Control+z'); await value(text,'hallo');
    assert.equal(await text.evaluate(el=>el.selectionStart),2);
    await text.pressSequentially('Q'); await value(text,'haQllo');
    await page.getByRole('button',{name:'Undo',exact:true}).click(); await value(text,'hallo');
    await page.getByRole('button',{name:'Redo',exact:true}).click(); await value(text,'haQllo');
    await text.press('Control+End'); await text.press('Enter'); await text.pressSequentially('zweite Zeile');
    await value(text,'haQllo\nzweite Zeile');
    const quote = page.locator('.atlasdoc-quote-content');
    if(await quote.count()) assert.equal(await quote.first().evaluate(el=>getComputedStyle(el).borderLeftWidth),'3px');
    await page.screenshot({path:'.qa/atlasdoc.png',fullPage:true});
    await page.emulateMedia({media:'print'});
    await page.screenshot({path:'.qa/atlasdoc-print.png',fullPage:true});
    await page.emulateMedia({media:'screen'});
    results.push('AtlasDoc sequential typing, middle edits, caret after Undo, toolbar/keyboard Redo, multiline, print');

    await page.goto(baseURL+'/?space='+space.id+'&page='+md.id);
    await ready(page,'textarea[aria-label="Markdown content"]');
    await page.getByRole('textbox',{name:'Markdown content',exact:true}).fill('| Label |\n| --- |\n| old |');
    const cell=page.locator('input[data-table-row="1"][data-table-column="0"]');
    await cell.waitFor();
    await cell.fill('');
    await page.waitForTimeout(600);
    await cell.pressSequentially('hallo Welt mit Leerzeichen',{delay:45});
    await value(cell,'hallo Welt mit Leerzeichen');
    await cell.press('Control+z'); await value(cell,'');
    await cell.press('Control+Shift+z'); await value(cell,'hallo Welt mit Leerzeichen');
    await cell.press('Home'); await cell.press('ArrowRight'); await cell.press('ArrowRight');
    await cell.pressSequentially('X'); await value(cell,'haXllo Welt mit Leerzeichen');
    await page.getByRole('button',{name:'Undo',exact:true}).click(); await value(cell,'hallo Welt mit Leerzeichen');
    assert.equal(await cell.evaluate(el=>el.selectionStart),2);
    await cell.press('End'); await cell.pressSequentially(' | \\ &');
    await value(cell,'hallo Welt mit Leerzeichen | \\ &');
    await page.getByRole('button',{name:'Edit source',exact:true}).click();
    const source=page.getByRole('textbox',{name:'Markdown content',exact:true});
    assert.match(await source.inputValue(),/hallo Welt mit Leerzeichen/);
    await page.getByRole('button',{name:'Visual tables',exact:true}).click();
    await value(cell,'hallo Welt mit Leerzeichen | \\ &');
    await page.getByRole('button',{name:'Preview',exact:true}).click();
    assert.match(await page.locator('.editor-body .markdown-preview').innerText(),/hallo Welt mit Leerzeichen/);
    await page.getByRole('button',{name:'Write',exact:true}).click();
    await page.screenshot({path:'.qa/markdown.png',fullPage:true});
    results.push('Markdown visual table sentence, spaces, Undo/Redo, middle caret, escaped pipe/backslash, source/preview');

    await page.goto(baseURL+'/?space='+space.id+'&page='+plain.id);
    await ready(page,'textarea[aria-label="Text content"]');
    const input=page.getByRole('textbox',{name:'Text content',exact:true});
    const original=await input.inputValue();
    await input.press('Control+End'); await input.pressSequentially(' local edit',{delay:45});
    await input.press('Control+z'); await value(input,original);
    await input.press('Control+y'); await value(input,original+' local edit');
    results.push('Plain text Undo/Redo');

    const password=crypto.randomBytes(20).toString('hex');
    const member=await json(page,'/api/users',{name:'QA Member '+run,email:'qa-member-'+run+'@example.test',password});
    assert.equal(member.metricsAccess,false);
    const memberContext=await browser.newContext({viewport:{width:1560,height:1100}});
    const memberPage=await memberContext.newPage();
    await login(memberPage,member.email,password);
    assert.equal((await memberPage.request.get(baseURL+'/api/metrics')).status(),403);
    assert.equal(await memberPage.getByRole('link',{name:'Instance dashboard',exact:true}).count(),0);
    assert.equal((await memberPage.request.patch(baseURL+'/api/users/'+member.id,{data:{metricsAccess:true}})).status(),403);
    await page.goto(baseURL+'/admin/users');
    const row=page.locator('.user-table-row').filter({hasText:member.email});
    await row.getByRole('button',{name:/Grant dashboard access/}).click();
    await row.getByText('Dashboard access granted').waitFor();
    await memberPage.reload();
    await memberPage.getByRole('link',{name:'Instance dashboard',exact:true}).waitFor();
    assert.equal((await memberPage.request.get(baseURL+'/api/metrics')).status(),200);
    const metrics=await memberPage.request.get(baseURL+'/api/metrics');
    assert.match(await metrics.text(),/# HELP atlas_/);
    assert.equal(metrics.headers()['cache-control'],'no-store, max-age=0');
    await memberPage.goto(baseURL+'/admin/dashboard');
    await memberPage.getByRole('heading',{name:'Instance dashboard'}).waitFor();
    assert.equal(await memberPage.getByRole('link',{name:'Users',exact:true}).count(),0);
    assert.equal(await memberPage.getByRole('link',{name:'Teams',exact:true}).count(),0);
    await memberPage.screenshot({path:'.qa/metrics-member.png',fullPage:true});
    await page.screenshot({path:'.qa/users-grant.png',fullPage:true});
    await row.getByRole('button',{name:/Revoke dashboard access/}).click();
    await row.getByRole('button',{name:/Grant dashboard access/}).waitFor();
    assert.equal((await memberPage.request.get(baseURL+'/api/metrics')).status(),403);
    await memberPage.goto(baseURL+'/admin/dashboard');
    await memberPage.waitForURL(url=>url.pathname==='/');
    assert.equal((await context.request.get(baseURL+'/api/metrics',{headers:{Authorization:'Bearer wrong'}})).status(),401);
    const anonymous=await browser.newContext();
    assert.equal((await anonymous.request.get(baseURL+'/api/metrics')).status(),404);
    await anonymous.close();
    await memberContext.close();
    results.push('Metrics admin UI grant/revoke, existing session enforcement, member navigation, no admin controls, auth denials');
    assert.deepEqual(errors,[]);
    fs.writeFileSync('.qa/results.json',JSON.stringify({results,errors},null,2));
    console.log(JSON.stringify({results,errors},null,2));
  } catch(error) {
    await page.screenshot({path:'.qa/failure.png',fullPage:true}).catch(()=>{});
    console.error(error);
    process.exitCode=1;
  } finally { await browser.close(); }
}
runChecks();
