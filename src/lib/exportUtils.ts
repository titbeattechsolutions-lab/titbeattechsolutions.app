export function exportToCSV(filename: string, headers: string[], data: any[][]) {
  // Map data to CSV string with proper escaping for Excel
  const csvContent = [
    headers.map(h => `"${h}"`).join(","),
    ...data.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
  ].join("\n");

  // Create a Blob and trigger an invisible download link
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
