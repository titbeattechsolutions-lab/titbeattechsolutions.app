const fs = require('fs');
let content = fs.readFileSync('src/components/school/School_Management_App.tsx', 'utf8');

// 1. Undo the bad injection
content = content.replace(/<Joyride[\s\S]*?\/>\s*/g, '');

// 2. Inject Joyride component properly
content = content.replace('  return (\n    <div className="flex h-screen bg-slate-50 font-sans text-slate-800">\n      {/* --- DESKTOP SIDEBAR --------------------------------------- */}', 
\  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-800">
      <Joyride
        steps={tourSteps}
        run={runTour}
        continuous={true}
        showProgress={true}
        showSkipButton={true}
        callback={handleJoyrideCallback}
        styles={{
          options: {
            primaryColor: '#2563eb',
            zIndex: 10000,
          }
        }}
      />
      {/* --- DESKTOP SIDEBAR --------------------------------------- */}\);

fs.writeFileSync('src/components/school/School_Management_App.tsx', content);
console.log("Fixed!");
