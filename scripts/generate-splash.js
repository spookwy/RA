/**
 * Generates build/splash.hta with:
 * - Proper UTF-8 BOM encoding (for Russian text in MSHTML)
 * - Embedded base64 logo from public/visualillusion_white.png
 */
const fs = require('fs');
const path = require('path');

const logoPath = path.join(__dirname, '..', 'public', 'visualillusion_white_n.png');
const outPath = path.join(__dirname, '..', 'build', 'splash.hta');

const logoB64 = fs.readFileSync(logoPath).toString('base64');

const html = `<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<HTA:APPLICATION ID="viSplash" BORDER="none" BORDERSTYLE="none" CAPTION="no"
  SHOWINTASKBAR="yes" SINGLEINSTANCE="yes" SYSMENU="no" SCROLL="no"
  MAXIMIZEBUTTON="no" MINIMIZEBUTTON="no" INNERBORDER="no" SELECTION="no"
  CONTEXTMENU="no" />
<style>
html, body { margin:0; padding:0; overflow:hidden; background:#0b0b12; height:100%; }
.wrap { display:table; width:100%; height:100%; }
.c { display:table-cell; vertical-align:middle; text-align:center; }
.logo {
  width:52px; height:52px;
  border-radius:13px;
  display:inline-block;
  margin-bottom:14px;
}
.t { color:#e4e4e7; font-family:'Segoe UI',sans-serif; font-size:14px; font-weight:600; display:block; margin-bottom:3px; }
.s { color:#52526a; font-family:'Segoe UI',sans-serif; font-size:11px; display:block; margin-bottom:20px; }
.bar { width:140px; height:3px; background:#16161f; border-radius:2px; margin:0 auto; position:relative; overflow:hidden; }
.bf { position:absolute; top:0; left:-50px; width:50px; height:3px; background:#7c3aed; border-radius:2px; }
</style>
</head>
<body>
<div class="wrap"><div class="c">
  <img class="logo" src="data:image/png;base64,${logoB64}" /><br>
  <span class="t">VisualIllusion</span>
  <span class="s">\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u0443\u0441\u0442\u0430\u043d\u043e\u0432\u0449\u0438\u043a\u0430...</span>
  <div class="bar"><div class="bf" id="b"></div></div>
</div></div>
<script>
window.resizeTo(420, 260);
window.moveTo(Math.round((screen.width - 420) / 2), Math.round((screen.height - 260) / 2));
var p = -50;
window.setInterval(function() {
  p += 2;
  if (p > 140) p = -50;
  try { document.getElementById('b').style.left = p + 'px'; } catch(e) {}
}, 16);
window.setTimeout(function() { try { window.close(); } catch(e) {} }, 120000);
</script>
</body>
</html>`;

// Write with UTF-8 BOM for MSHTML
const BOM = Buffer.from([0xEF, 0xBB, 0xBF]);
const content = Buffer.concat([BOM, Buffer.from(html, 'utf-8')]);
fs.writeFileSync(outPath, content);
console.log('[splash] splash.hta generated with logo (' + Math.round(logoB64.length / 1024) + 'KB base64) + UTF-8 BOM');
