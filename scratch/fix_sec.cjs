const fs = require('fs');
const path = 'c:/Users/hp/OneDrive/Desktop/myschoolgradeflow_clone/src/components/school/School_Management_App.tsx';
const lines = fs.readFileSync(path, 'utf8').split('\n');

const startIdx = lines.findIndex(l => l.includes('{sec === "result_checker" && (() => {'));
const endIdx = lines.findIndex((l, i) => i > startIdx && l.includes('})()}'));

if (startIdx !== -1 && endIdx !== -1) {
  const block = lines.splice(startIdx, endIdx - startIdx + 1);
  lines.splice(startIdx - 5, 0, ...block);
  fs.writeFileSync(path, lines.join('\n'));
  console.log('Moved result_checker block');
} else {
  console.log('Could not find block');
}
