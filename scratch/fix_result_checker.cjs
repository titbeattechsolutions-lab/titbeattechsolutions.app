const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/components/school/School_Management_App.tsx');
let content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Find the start and end of the IIFE
const startIdx = lines.findIndex(l => l.includes('{sec === "result_checker" && (() => {'));
let endIdx = -1;
let braces = 0;
for (let i = startIdx; i < lines.length; i++) {
  if (lines[i].includes('})()}')) {
    endIdx = i;
    break;
  }
}

if (startIdx !== -1 && endIdx !== -1) {
  const iifeBody = lines.slice(startIdx + 1, endIdx).join('\n');
  
  // Create the new component
  const componentCode = `
// ─── Result Checker Settings ──────────────────────────────────────────────────
const ResultCheckerSettings = ({ tenantId, draft, showToast }: any) => {
${iifeBody}
};
`;

  // Replace the IIFE with the component call
  lines.splice(startIdx, endIdx - startIdx + 1, '          {sec === "result_checker" && <ResultCheckerSettings tenantId={tenantId} draft={draft} showToast={showToast} />}');

  // Re-join to string
  content = lines.join('\n');

  // Insert the component before ReportSheet
  content = content.replace('// ─── Report Sheet ─────────────────────────────────────────────────────────────', componentCode + '\n// ─── Report Sheet ─────────────────────────────────────────────────────────────');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Fixed successfully!');
} else {
  console.log('Could not find IIFE bounds');
}
