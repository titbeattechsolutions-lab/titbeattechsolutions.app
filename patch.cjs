const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'school', 'School_Management_App.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const target1 = `    setPayingStudent(null); setPayAmount(""); setPayNote("");\n  };\n\n  const statusOf = (paid: number, expected: number) => {`;
const replace1 = `    setPayingStudent(null); setPayAmount(""); setPayNote("");
  };

  const generateReceiptPDF = () => {
    if (!receiptData) return;
    try {
      const doc = new jspdf.jsPDF({ format: "a5" });
      const schName = schoolSettings?.name || "School";
      
      // Header
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(schName, 14, 20);
      
      doc.setFontSize(12);
      doc.text("OFFICIAL PAYMENT RECEIPT", 14, 30);
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(\`Date: \${new Date().toLocaleDateString()}\`, 14, 40);
      doc.text(\`Term: \${receiptData.term}\`, 14, 46);
      
      doc.setLineWidth(0.5);
      doc.line(14, 52, 134, 52); // A5 width is 148
      
      // Body
      doc.setFontSize(11);
      doc.text(\`Student Name:  \${receiptData.student}\`, 14, 62);
      doc.text(\`Amount Paid:   NGN \${receiptData.amount.toLocaleString()}\`, 14, 70);
      
      doc.setFont("helvetica", "bold");
      doc.text(\`Balance:        NGN \${receiptData.balance.toLocaleString()}\`, 14, 78);
      
      // Footer
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.text("Thank you for your payment!", 14, 95);
      
      doc.save(\`Receipt_\${receiptData.student.replace(/\\s+/g, '_')}_\${term.replace(/\\s+/g, '_')}.pdf\`);
      showToast("Receipt downloaded successfully!", "success");
    } catch (e) {
      console.error(e);
      showToast("Failed to generate PDF.", "error");
    }
  };

  const statusOf = (paid: number, expected: number) => {`;

const target2 = `{["school_admin", "principal", "bursar", "secretary"].includes(role || "") && (
                <button 
                  className="w-full flex items-center justify-center h-14 text-lg font-bold bg-[#25D366] hover:bg-[#1ebd5a] text-white rounded-xl shadow-lg transition-colors"
                  onClick={() => {
                    const text = \`Hello! We have safely received a school fee payment of NGN \${receiptData.amount.toLocaleString()} for \${receiptData.student} (\${receiptData.term}). Outstanding balance is NGN \${receiptData.balance.toLocaleString()}. Thank you!\`;
                    const url = \`https://wa.me/?text=\${encodeURIComponent(text)}\`;
                    window.open(url, "_blank");
                  }}
                >
                  <MessageSquare className="mr-2 h-6 w-6" />
                  Share Receipt via WhatsApp
                </button>
              )}
              <button 
                className="w-full flex items-center justify-center h-14 text-lg font-bold text-slate-600 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
                onClick={() => setShowReceiptModal(false)}
              >
                Close
              </button>`;

const replace2 = `{["school_admin", "principal", "bursar", "secretary"].includes(role || "") && (
                <button 
                  className="w-full flex items-center justify-center h-14 text-lg font-bold bg-[#25D366] hover:bg-[#1ebd5a] text-white rounded-xl shadow-lg transition-colors"
                  onClick={() => {
                    const text = \`Hello! We have safely received a school fee payment of NGN \${receiptData.amount.toLocaleString()} for \${receiptData.student} (\${receiptData.term}). Outstanding balance is NGN \${receiptData.balance.toLocaleString()}. Thank you!\`;
                    const url = \`https://wa.me/?text=\${encodeURIComponent(text)}\`;
                    window.open(url, "_blank");
                  }}
                >
                  <MessageSquare className="mr-2 h-6 w-6" />
                  Share Receipt via WhatsApp
                </button>
              )}
              <button 
                className="w-full flex items-center justify-center h-14 text-lg font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg transition-colors"
                onClick={generateReceiptPDF}
              >
                <Printer className="mr-2 h-6 w-6" />
                Download / Print Receipt
              </button>
              <button 
                className="w-full flex items-center justify-center h-14 text-lg font-bold text-slate-600 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
                onClick={() => setShowReceiptModal(false)}
              >
                Close
              </button>`;

// Normalize CRLF to LF for both content and target to match perfectly
const normalize = (str) => str.replace(/\r\n/g, '\n');

content = normalize(content);
const nTarget1 = normalize(target1);
const nTarget2 = normalize(target2);

if (!content.includes(nTarget1)) {
  console.log("Target 1 not found!");
} else {
  content = content.replace(nTarget1, normalize(replace1));
  console.log("Target 1 replaced.");
}

if (!content.includes(nTarget2)) {
  console.log("Target 2 not found!");
} else {
  content = content.replace(nTarget2, normalize(replace2));
  console.log("Target 2 replaced.");
}

// Write back with CRLF as expected by windows/prettier
fs.writeFileSync(filePath, content.replace(/\n/g, '\r\n'), 'utf8');
console.log("Done.");
