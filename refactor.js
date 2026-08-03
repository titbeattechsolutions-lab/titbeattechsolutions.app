const fs = require('fs');
let content = fs.readFileSync('src/pages/SchoolLock.tsx', 'utf8');

const regex = /<div className="auth-float-container">\s*([\s\S]*?)<\/div>\s*<\/div>\s*<div className="auth-layout">\s*(<div className="auth-side">[\s\S]*?<\/div>\s*<\/div>)\s*<div className="auth-card">/;

content = content.replace(regex, (match, floatCards, authSide) => {
    return <div className="auth-layout">
        <div className="auth-card-wrapper">
           + floatCards + 
          <div className="auth-card" style={{ width: "100%" }}>;
});

// Now we need to append the authSide after the auth-card-wrapper closes.
// The auth-card closes at lines:
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }

const endRegex = /<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*\);\s*}/;
content = content.replace(endRegex, (match) => {
    // wait, we need authSide to be inserted after auth-card-wrapper, which is inside auth-layout.
    return '</div>\n        ' + authSide + '\n      </div>\n    </div>\n  );\n}';
});

fs.writeFileSync('src/pages/SchoolLock.tsx', content);
console.log("Done");
