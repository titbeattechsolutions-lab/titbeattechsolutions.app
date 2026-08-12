const fs = require('fs');
const path = require('path');
const origPath = 'c:/Users/hp/OneDrive/Desktop/myschoolgradeflow/src/components/school/School_Management_App.tsx';
const clonePath = 'c:/Users/hp/OneDrive/Desktop/myschoolgradeflow_clone/src/components/school/School_Management_App.tsx';

let orig = fs.readFileSync(origPath, 'utf8');
let clone = fs.readFileSync(clonePath, 'utf8');

// Find the tab entry
const tabRegex = /{ id:\s*"result_checker", label:\s*"Result Checker", icon:\s*"🔑" },/;
const tabMatch = orig.match(tabRegex);
if (tabMatch) {
  if (!clone.includes('"result_checker"')) {
    // Insert after settings tab
    clone = clone.replace(/({ id:\s*"settings", label:\s*"Settings", icon:\s*"⚙️" },)/, '$1\n  ' + tabMatch[0]);
    console.log('Inserted tab');
  } else {
    console.log('Tab already exists');
  }
} else {
  console.log('Could not find tab in orig');
}

// Find the UI block
// It starts with `{sec === "result_checker" && (() => {` and ends right before `// ─── Report Sheet`
const uiMatch = orig.match(/\{\s*sec === "result_checker"[\s\S]*?(?=\s*\/\/\s*───\s*Report Sheet)/);
if (uiMatch) {
  if (!clone.includes('sec === "result_checker"')) {
    // We want to insert it right before the closing tags of SettingsTab.
    // In SettingsTab, the last section is `security`.
    // Let's find the closing of SettingsTab which is `        </div>\n      </div>\n    </div>\n  );\n});`
    const settingsEndRegex = /(        <\/div>\s*<\/div>\s*<\/div>\s*\);\s*\}\);)/;
    if (clone.match(settingsEndRegex)) {
       clone = clone.replace(settingsEndRegex, uiMatch[0] + '\n$1');
       console.log('Inserted UI block perfectly');
    } else {
       console.log('Could not find SettingsTab end');
    }
  } else {
    console.log('UI block already exists');
  }
} else {
  console.log('Could not find UI block in orig');
}

fs.writeFileSync(clonePath, clone);
console.log('Done');
