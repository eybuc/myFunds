const { useState, useEffect, useCallback } = React;

const FUND_TYPES = [
  'תגמולים ואישית לפיצויים',
  'קרנות השתלמות',
  'מרכזית לפיצויים',
  'מטרה אחרת',
  'קופת גמל להשקעה',
  'קופת גמל להשקעה חיסכון לכל ילד',
  'קרנות חדשות',
  'קרנות כלליות',
  'פוליסות שהונפקו החל משנת 2004',
  'פוליסות שהונפקו בשנים 1990-1991',
  'פוליסות שהונפקו בשנים 1992-2003'
];

const MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
];

function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

function formatReportPeriod(period) {
  if (!period || period.length !== 6) return period;
  const year = period.substring(0, 4);
  const month = parseInt(period.substring(4, 6), 10);
  return `${year}/${month}`;
}

function App() {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [darkMode]);

  return React.createElement(
    'div',
    { className: 'container' },
    React.createElement(
      'button',
      { 
        onClick: () => setDarkMode(!darkMode),
        className: 'dark-mode-toggle'
      },
      darkMode ? 'Light Mode' : 'Dark Mode'
    ),
    React.createElement(DataTable)
  );
}

function DataTable() {
  const [mainData, setMainData] = useState([]);
  const [comparisonData, setComparisonData] = useState([]);
  const [showDateRange, setShowDateRange] = useState(false);
  const [startMonth, setStartMonth] = useState('');
  const [startYear, setStartYear] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const [endYear, setEndYear] = useState('');
  const [mainSortConfig, setMainSortConfig] = useState({ key: null, direction: 'ascending' });
  const [comparisonSortConfig, setComparisonSortConfig] = useState({ key: null, direction: 'ascending' });
  const [showComparison, setShowComparison] = useState(false);
  const [clientName, setClientName] = useState('');

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 30 }, (_, i) => currentYear - i);

  const handleProgramSelect = async function(selectedProgram, isComparison = false) {
    try {
      const response = await fetch(`/api/search?fundClassification=${encodeURIComponent(selectedProgram.FUND_CLASSIFICATION)}&fundId=${encodeURIComponent(selectedProgram.FUND_ID)}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const fundData = await response.json();
      
      const endDate = fundData.REPORT_PERIOD;
      const startDate = calculateStartDate(endDate);
      
      const twrResponse = await fetch('/api/calculate-twr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fundIds: [fundData.FUND_ID], startDate, endDate }),
      });
      
      if (!twrResponse.ok) {
        throw new Error(`HTTP error! status: ${twrResponse.status}`);
      }
      
      const twrData = await twrResponse.json();
      const initialTWR = twrData[0].TWR;
      
      const newFundData = { ...fundData, sum: '', TWR: initialTWR };
      
      if (isComparison) {
        setComparisonData(prevData => [...prevData, newFundData]);
      } else {
        setMainData(prevData => [...prevData, newFundData]);
      }
    } catch (error) {
      console.error('Error fetching fund data:', error);
    }
  };

  const calculateStartDate = function(endDate) {
    const year = parseInt(endDate.substring(0, 4));
    const month = parseInt(endDate.substring(4, 6));
    let startYear = year;
    let startMonth = month - 11;
    
    if (startMonth <= 0) {
      startYear--;
      startMonth += 12;
    }
    
    return `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
  };

  const handleDelete = function(fundId, isComparison = false) {
    if (isComparison) {
      setComparisonData(prevData => prevData.filter(item => item.FUND_ID !== fundId));
    } else {
      setMainData(prevData => prevData.filter(item => item.FUND_ID !== fundId));
    }
  };

  const formatNumber = (num) => {
    if (num === null || num === undefined || isNaN(num)) return 'N/A';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  const formatNumberInput = (value) => {
    // Remove non-digit characters
    const numericValue = value.replace(/[^\d]/g, '');
    // Format with commas
    return numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  const handleSumChange = function(fundId, value, isComparison = false) {
    const formattedValue = formatNumberInput(value);
    const numericValue = formattedValue.replace(/,/g, '');
  
    const updateData = (prevData) => {
      return prevData.map(item => 
        item.FUND_ID === fundId ? { ...item, sum: formattedValue, rawSum: numericValue } : item
      );
    };
  
    if (isComparison) {
      setComparisonData(updateData);
    } else {
      setMainData(updateData);
    }
  };

  const formatPercentage = function(value, divideBy100 = false) {
    if (value === null || value === undefined || isNaN(value) || value === 'N/A') return 'N/A';
    const percentage = divideBy100 ? parseFloat(value) : parseFloat(value);
    return `${percentage.toFixed(2)}%`;
  };

  const calculateExposure = function(value, totalAssets) {
    if (value === null || totalAssets === null || totalAssets === 0) return 'N/A';
    return formatPercentage((value / totalAssets) * 100);
  };

  const calculateWeightedSum = function(field, data) {
    const totalSum = data.reduce((acc, item) => acc + (parseFloat(item.rawSum) || 0), 0);
    const weightedSum = data.reduce((acc, item) => {
      const sum = parseFloat(item.rawSum) || 0;
      const value = parseFloat(item[field]) || 0;
      return acc + (value * sum) / item.TOTAL_ASSETS;
    }, 0);
    
    if (totalSum > 0) {
      const percentage = (weightedSum / totalSum) * 100;
      return `${percentage.toFixed(2)}%`;
    } else {
      return 'N/A';
    }
  };

  const handleSearch = async function() {
    const startDate = startMonth && startYear ? `${startYear}-${String(MONTHS.indexOf(startMonth) + 1).padStart(2, '0')}-01` : '';
    const endDate = endMonth && endYear ? `${endYear}-${String(MONTHS.indexOf(endMonth) + 1).padStart(2, '0')}-01` : '';
    
    if (!startDate || !endDate) {
      alert('Please select both start and end dates');
      return;
    }

    const mainFundIds = mainData.map(item => item.FUND_ID);
    const comparisonFundIds = comparisonData.map(item => item.FUND_ID);
    
    if (mainFundIds.length === 0 && comparisonFundIds.length === 0) {
      alert('Please select at least one fund before calculating TWR');
      return;
    }

    try {
      // Update main data
      if (mainFundIds.length > 0) {
        const mainResponse = await fetch('/api/calculate-twr', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fundIds: mainFundIds, startDate, endDate }),
        });

        if (!mainResponse.ok) {
          const errorText = await mainResponse.text();
          throw new Error(`HTTP error! status: ${mainResponse.status}, message: ${errorText}`);
        }

        const updatedMainData = await mainResponse.json();

        if (!Array.isArray(updatedMainData) || updatedMainData.length === 0) {
          throw new Error('Invalid data received from server for main table');
        }

        setMainData(prevData => updatedMainData.map(item => ({
          ...item,
          sum: prevData.find(d => d.FUND_ID === item.FUND_ID)?.sum || ''
        })));
      }

      // Update comparison data
      if (comparisonFundIds.length > 0) {
        const comparisonResponse = await fetch('/api/calculate-twr', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fundIds: comparisonFundIds, startDate, endDate }),
        });

        if (!comparisonResponse.ok) {
          const errorText = await comparisonResponse.text();
          throw new Error(`HTTP error! status: ${comparisonResponse.status}, message: ${errorText}`);
        }

        const updatedComparisonData = await comparisonResponse.json();

        if (!Array.isArray(updatedComparisonData) || updatedComparisonData.length === 0) {
          throw new Error('Invalid data received from server for comparison table');
        }

        setComparisonData(prevData => updatedComparisonData.map(item => ({
          ...item,
          sum: prevData.find(d => d.FUND_ID === item.FUND_ID)?.sum || ''
        })));
      }
    } catch (error) {
      console.error('Error calculating TWR:', error);
      alert(`Error calculating TWR: ${error.message}`);
    }
  };

  const handleResetToLatest = async function() {
    const mainFundIds = mainData.map(item => item.FUND_ID);
    const comparisonFundIds = comparisonData.map(item => item.FUND_ID);
    
    if (mainFundIds.length === 0 && comparisonFundIds.length === 0) {
      alert('No funds selected');
      return;
    }

    try {
      const allFundIds = [...mainFundIds, ...comparisonFundIds];
      const response = await fetch('/api/get-latest-fund-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fundIds: allFundIds }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const latestData = await response.json();
      
      const twrPromises = latestData.map(async (item) => {
        const endDate = item.REPORT_PERIOD;
        const startDate = calculateStartDate(endDate);
        
        const twrResponse = await fetch('/api/calculate-twr', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fundIds: [item.FUND_ID], startDate, endDate }),
        });
        
        if (!twrResponse.ok) {
          throw new Error(`HTTP error! status: ${twrResponse.status}`);
        }
        
        const twrData = await twrResponse.json();
        return { ...item, TWR: twrData[0].TWR };
      });
      
      const updatedLatestData = await Promise.all(twrPromises);
      
      setMainData(prevData => updatedLatestData.filter(item => mainFundIds.includes(item.FUND_ID)).map(item => ({
        ...item,
        sum: prevData.find(d => d.FUND_ID === item.FUND_ID)?.sum || ''
      })));

      setComparisonData(prevData => updatedLatestData.filter(item => comparisonFundIds.includes(item.FUND_ID)).map(item => ({
        ...item,
        sum: prevData.find(d => d.FUND_ID === item.FUND_ID)?.sum || ''
      })));
    } catch (error) {
      console.error('Error fetching latest fund data:', error);
      alert('Error fetching latest data. Please try again.');
    }
  };

  const sortData = (key, isComparison = false) => {
    const sortConfig = isComparison ? comparisonSortConfig : mainSortConfig;
    const setSortConfig = isComparison ? setComparisonSortConfig : setMainSortConfig;

    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getSortedData = (data, sortConfig) => {
    if (!sortConfig.key) return data;
    return [...data].sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];
      
      if (sortConfig.key === 'sum' || sortConfig.key === 'TWR' || 
          sortConfig.key === 'YEAR_TO_DATE_YIELD' || 
          sortConfig.key === 'AVG_ANNUAL_YIELD_TRAILING_3YRS' || 
          sortConfig.key === 'AVG_ANNUAL_YIELD_TRAILING_5YRS' ||
          sortConfig.key === 'STOCK_MARKET_EXPOSURE' || 
          sortConfig.key === 'FOREIGN_CURRENCY_EXPOSURE' || 
          sortConfig.key === 'FOREIGN_EXPOSURE') {
        aValue = parseFloat(aValue) || 0;
        bValue = parseFloat(bValue) || 0;
      }
      
      if (aValue < bValue) {
        return sortConfig.direction === 'ascending' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'ascending' ? 1 : -1;
      }
      return 0;
    });
  };

  const handleCompare = () => {
    setShowComparison(!showComparison);
  };

  const handleCreatePDF = () => {
    console.log('Starting PDF generation...');
    try {
      const { jsPDF } = window.jspdf;
      if (!jsPDF) {
        console.error('jsPDF is not available');
        alert('PDF generation failed: jsPDF is not available');
        return;
      }
  
      console.log('Creating jsPDF instance...');
      const doc = new jsPDF({ orientation: 'landscape' });
      
      console.log('Setting font...');
      doc.addFont("https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf", "DejaVu", "normal");
      doc.setFont("DejaVu");

    // Helper function for RTL text
    const rtlText = (text) => text.split('').reverse().join('');

  
    // Helper function for text wrapping
    const wrapText = (text, maxWidth, fontSize) => {
      const words = text.split(' ');
      const lines = [];
      let currentLine = '';
  
      words.forEach(word => {
        const width = doc.getStringUnitWidth(currentLine + ' ' + word) * fontSize / doc.internal.scaleFactor;
        if (width < maxWidth) {
          currentLine += (currentLine ? ' ' : '') + word;
        } else {
          lines.push(currentLine);
          currentLine = word;
        }
      });
      if (currentLine) lines.push(currentLine);
      return lines;
    };
  
    // Function to draw a table
    const drawTable = (data, startY, title) => {
      // Add title
      doc.setFontSize(14);
      doc.text(rtlText(title), doc.internal.pageSize.width - 10, startY - 10, { align: 'right' });

      // Table settings
      const margin = 10;
      const pageWidth = doc.internal.pageSize.width;
      const colWidths = [20, 15, 15, 15, 15, 15, 20, 20, 20, 40, 60];
      const headerHeight = 14;
      const rowHeight = 10;
      let currentY = startY;
  
      // Headers
      const headers = [
        'תאריך עדכון', 'חשיפה לחו"ל', 'חשיפה למט"ח', 'חשיפה למניות',
        'ממוצעת 5 שנים', 'ממוצעת 3 שנים', 'תשואה מתחילת השנה',
        'מצטברת לתקופה', 'סכום', 'סוג קופה', 'שם תכנית'
      ];
  
      // Draw headers
      doc.setFillColor(41, 128, 185);
      doc.rect(margin, currentY, pageWidth - 2 * margin, headerHeight, 'F');
      doc.setTextColor(255);
      doc.setFontSize(7);
  
      let currentX = margin;
      headers.forEach((header, index) => {
        const wrappedHeader = wrapText(header, colWidths[index] - 2, 7);
        wrappedHeader.forEach((line, lineIndex) => {
          doc.text(rtlText(line), currentX + colWidths[index] - 1, currentY + 4 + (lineIndex * 3), { align: 'right' });
        });
        currentX += colWidths[index];
      });
  
      currentY += headerHeight;
  
      // Draw data rows
      doc.setTextColor(0);
      doc.setFontSize(7);
  
      let sumAmount = 0;
  
      data.forEach((row, rowIndex) => {
        currentX = margin;
        const rowStartY = currentY;
        let maxRowHeight = rowHeight;

        if (rowIndex % 2 === 0) {
          doc.setFillColor(240);
          doc.rect(margin, currentY, pageWidth - 2 * margin, rowHeight, 'F');
        }

        [
          formatReportPeriod(row.REPORT_PERIOD),
          calculateExposure(row.FOREIGN_EXPOSURE, row.TOTAL_ASSETS),
          calculateExposure(row.FOREIGN_CURRENCY_EXPOSURE, row.TOTAL_ASSETS),
          calculateExposure(row.STOCK_MARKET_EXPOSURE, row.TOTAL_ASSETS),
          formatPercentage(row.AVG_ANNUAL_YIELD_TRAILING_5YRS, true),
          formatPercentage(row.AVG_ANNUAL_YIELD_TRAILING_3YRS, true),
          formatPercentage(row.YEAR_TO_DATE_YIELD, true),
          formatPercentage(row.TWR),
          row.sum, // Display the formatted sum
          row.FUND_CLASSIFICATION,
          row.FUND_ID_NAME
        ].forEach((cellData, cellIndex) => {
          if (cellIndex >= 9) {
            const wrappedText = wrapText(cellData, colWidths[cellIndex] - 2, 7);
            const cellHeight = wrappedText.length * 3.5;
            if (cellHeight > maxRowHeight) maxRowHeight = cellHeight;

            wrappedText.forEach((line, lineIndex) => {
              doc.text(rtlText(line), currentX + colWidths[cellIndex] - 1, currentY + 3.5 + (lineIndex * 3.5), { align: 'right' });
            });
          } else {
            doc.text(cellData, currentX + colWidths[cellIndex] / 2, currentY + 5, { align: 'center' });
          }
          currentX += colWidths[cellIndex];
        });

        sumAmount += parseFloat(row.rawSum) || 0;

        currentY += maxRowHeight;
      });

  
      // Draw weighted sums row
      doc.setFillColor(240);
      doc.rect(margin, currentY, pageWidth - 2 * margin, rowHeight, 'F');
      currentX = margin;

      [
        '',
        calculateWeightedSum('FOREIGN_EXPOSURE', data),
        calculateWeightedSum('FOREIGN_CURRENCY_EXPOSURE', data),
        calculateWeightedSum('STOCK_MARKET_EXPOSURE', data),
        '', '', '', '',
        formatNumber(sumAmount.toFixed(2)),
        '',
        rtlText('סה"כ משוקלל:')
      ].forEach((cellData, cellIndex) => {
        const align = cellIndex === 10 ? 'right' : 'center';
        doc.text(cellData, currentX + colWidths[cellIndex] - (align === 'right' ? 1 : colWidths[cellIndex] / 2), currentY + 5, { align });
        currentX += colWidths[cellIndex];
      });

      return currentY + rowHeight;
    };

    console.log('Drawing main table...');
    const mainTableEndY = drawTable(mainData, 25, 'נתוני קופות גמל, פוליסות ופנסיה');

    if (comparisonData && comparisonData.length > 0) {
      console.log('Drawing comparison table...');
      doc.addPage();
      drawTable(comparisonData, 25, 'טבלת השוואה');
    }

    console.log('Adding footer...');
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(10);
      doc.text(rtlText('כל הזכויות שמורות לבוכמן פתרונות פיננסים*'), doc.internal.pageSize.width - 10, doc.internal.pageSize.height - 10, { align: 'right' });
    }

    console.log('Saving PDF...');
    doc.save('נתוני_קופות_גמל_פוליסות_ופנסיה.pdf');
    console.log('PDF saved successfully');
  } catch (error) {
    console.error('Error generating PDF:', error);
    alert(`PDF generation failed: ${error.message}`);
  }
};

  const renderTable = (data, sortConfig, isComparison = false) => {
    const totalSum = data.reduce((acc, item) => acc + (parseFloat(item.rawSum) || 0), 0);

    return React.createElement(
      'div',
      { className: 'data-table-container' },
      React.createElement(
        'table',
        { className: 'data-table' },
        React.createElement(
          'thead',
          null,
          React.createElement(
            'tr',
            null,
            React.createElement('th', { 
              onClick: () => sortData('FUND_ID_NAME', isComparison),
              className: sortConfig.key === 'FUND_ID_NAME' ? `sort-${sortConfig.direction}` : ''
            }, 'שם תכנית'),
            React.createElement('th', { 
              onClick: () => sortData('FUND_CLASSIFICATION', isComparison),
              className: sortConfig.key === 'FUND_CLASSIFICATION' ? `sort-${sortConfig.direction}` : ''
            }, 'סוג קופה'),
            React.createElement('th', { 
              onClick: () => sortData('sum', isComparison),
              className: sortConfig.key === 'sum' ? `sort-${sortConfig.direction}` : ''
            }, 'סכום'),
            React.createElement('th', { 
              onClick: () => sortData('TWR', isComparison),
              className: sortConfig.key === 'TWR' ? `sort-${sortConfig.direction}` : ''
            }, 'מצטברת לתקופה'),
            React.createElement('th', { 
              onClick: () => sortData('YEAR_TO_DATE_YIELD', isComparison),
              className: sortConfig.key === 'YEAR_TO_DATE_YIELD' ? `sort-${sortConfig.direction}` : ''
            }, 'תשואה מתחילת השנה'),
            React.createElement('th', { 
              onClick: () => sortData('AVG_ANNUAL_YIELD_TRAILING_3YRS', isComparison),
              className: sortConfig.key === 'AVG_ANNUAL_YIELD_TRAILING_3YRS' ? `sort-${sortConfig.direction}` : ''
            }, 'ממוצעת 3 שנים'),
            React.createElement('th', { 
              onClick: () => sortData('AVG_ANNUAL_YIELD_TRAILING_5YRS', isComparison),
              className: sortConfig.key === 'AVG_ANNUAL_YIELD_TRAILING_5YRS' ? `sort-${sortConfig.direction}` : ''
            }, 'ממוצעת 5 שנים'),
            React.createElement('th', { 
              onClick: () => sortData('STOCK_MARKET_EXPOSURE', isComparison),
              className: sortConfig.key === 'STOCK_MARKET_EXPOSURE' ? `sort-${sortConfig.direction}` : ''
            }, 'חשיפה למניות'),
            React.createElement('th', { 
              onClick: () => sortData('FOREIGN_CURRENCY_EXPOSURE', isComparison),
              className: sortConfig.key === 'FOREIGN_CURRENCY_EXPOSURE' ? `sort-${sortConfig.direction}` : ''
            }, 'חשיפה למט"ח'),
            React.createElement('th', { 
              onClick: () => sortData('FOREIGN_EXPOSURE', isComparison),
              className: sortConfig.key === 'FOREIGN_EXPOSURE' ? `sort-${sortConfig.direction}` : ''
            }, 'חשיפה לחו"ל'),
            React.createElement('th', { 
              onClick: () => sortData('REPORT_PERIOD', isComparison),
              className: sortConfig.key === 'REPORT_PERIOD' ? `sort-${sortConfig.direction}` : ''
            }, 'תאריך עדכון'),
            React.createElement('th', null, 'פעולות')
          )
        ),
        React.createElement(
          'tbody',
          null,
          getSortedData(data, sortConfig).map((item) =>
            React.createElement(
              'tr',
              { key: item.FUND_ID },
              React.createElement('td', null, item.FUND_ID_NAME),
              React.createElement('td', null, item.FUND_CLASSIFICATION),
              React.createElement(
                'td',
                null,
                React.createElement('input', {
                  type: 'text',
                  value: item.sum,
                  onChange: (e) => handleSumChange(item.FUND_ID, e.target.value, isComparison),
                  className: 'sum-input'
                })
              ),
              React.createElement('td', null, formatPercentage(item.TWR)),
              React.createElement('td', null, formatPercentage(item.YEAR_TO_DATE_YIELD, true)),
              React.createElement('td', null, formatPercentage(item.AVG_ANNUAL_YIELD_TRAILING_3YRS, true)),
              React.createElement('td', null, formatPercentage(item.AVG_ANNUAL_YIELD_TRAILING_5YRS, true)),
              React.createElement('td', null, calculateExposure(item.STOCK_MARKET_EXPOSURE, item.TOTAL_ASSETS)),
              React.createElement('td', null, calculateExposure(item.FOREIGN_CURRENCY_EXPOSURE, item.TOTAL_ASSETS)),
              React.createElement('td', null, calculateExposure(item.FOREIGN_EXPOSURE, item.TOTAL_ASSETS)),
              React.createElement('td', null, formatReportPeriod(item.REPORT_PERIOD)),
              React.createElement(
                'td',
                null,
                React.createElement(
                  'button',
                  { onClick: () => handleDelete(item.FUND_ID, isComparison) },
                  'מחק'
                )
              )
            )
          )
        ),
        React.createElement(
          'tfoot',
          null,
          React.createElement(
            'tr',
            null,
            React.createElement('td', { colSpan: '2' }, 'סה"כ משוקלל:'),
            React.createElement('td', null, formatNumber(totalSum.toFixed(2))),
            React.createElement('td', null, calculateWeightedSum('TWR', data)),
            React.createElement('td', null, calculateWeightedSum('YEAR_TO_DATE_YIELD', data)),
            React.createElement('td', null, calculateWeightedSum('AVG_ANNUAL_YIELD_TRAILING_3YRS', data)),
            React.createElement('td', null, calculateWeightedSum('AVG_ANNUAL_YIELD_TRAILING_5YRS', data)),
            React.createElement('td', null, calculateWeightedSum('STOCK_MARKET_EXPOSURE', data)),
            React.createElement('td', null, calculateWeightedSum('FOREIGN_CURRENCY_EXPOSURE', data)),
            React.createElement('td', null, calculateWeightedSum('FOREIGN_EXPOSURE', data)),
            React.createElement('td', { colSpan: '2' })
          )
        )
      )
    );
  };

  return React.createElement(
    'div',
    null,
    React.createElement(
      'div',
      { className: 'header' },
      React.createElement('h1', null, 'נתוני קופות גמל, פוליסות ופנסיה'),
      React.createElement('input', {
        type: 'text',
        value: clientName,
        onChange: (e) => setClientName(e.target.value),
        placeholder: 'שם לקוח',
        className: 'client-name-input'
      }),
      React.createElement(
        'button',
        { 
          onClick: () => {
            console.log('PDF button clicked');
            try {
              handleCreatePDF();
            } catch (error) {
              console.error('Error in handleCreatePDF:', error);
              alert('An error occurred while creating the PDF. Please check the console for more details.');
            }
          }, 
          className: 'pdf-button'
        },
        'צור PDF'
      )
    ),
    React.createElement(ProgramSearch, { onSelect: (program) => handleProgramSelect(program, false) }),
    React.createElement(
      'div',
      { className: 'button-container' },
      React.createElement(
        'button',
        { onClick: handleResetToLatest, className: 'reset-button' },
        'חזור לנתונים עדכניים'
      ),
      React.createElement(
        'button',
        { onClick: () => setShowDateRange(!showDateRange), className: 'date-range-button' },
        'תאריכים לפי בחירה'
      )
    ),
    showDateRange && React.createElement(
      'div',
      { className: 'date-range-container' },
      React.createElement(
        'div',
        { className: 'date-input' },
        React.createElement('label', null, 'מתאריך:'),
        React.createElement(
          'select',
          { value: startMonth, onChange: (e) => setStartMonth(e.target.value), className: 'month-select' },
          React.createElement('option', { value: '' }, 'חודש'),
          MONTHS.map((month) => React.createElement('option', { key: month, value: month }, month))
        ),
        React.createElement(
          'select',
          { value: startYear, onChange: (e) => setStartYear(e.target.value), className: 'year-select' },
          React.createElement('option', { value: '' }, 'שנה'),
          years.map((year) => React.createElement('option', { key: year, value: year }, year))
        )
      ),
      React.createElement(
        'div',
        { className: 'date-input' },
        React.createElement('label', null, 'עד תאריך:'),
        React.createElement(
          'select',
          { value: endMonth, onChange: (e) => setEndMonth(e.target.value), className: 'month-select' },
          React.createElement('option', { value: '' }, 'חודש'),
          MONTHS.map((month) => React.createElement('option', { key: month, value: month }, month))
        ),
        React.createElement(
          'select',
          { value: endYear, onChange: (e) => setEndYear(e.target.value), className: 'year-select' },
          React.createElement('option', { value: '' }, 'שנה'),
          years.map((year) => React.createElement('option', { key: year, value: year }, year))
        )
      ),
      React.createElement(
        'button',
        { onClick: handleSearch, className: 'search-button' },
        'חפש'
      )
    ),
    renderTable(mainData, mainSortConfig, false),
    React.createElement(
      'div',
      { className: 'compare-button-container' },
      React.createElement(
        'button',
        { onClick: handleCompare, className: 'compare-button' },
        showComparison ? '▲' : '▼'
      )
    ),
    showComparison && React.createElement(
      'div',
      { className: 'comparison-container' },
      React.createElement('h2', null, 'השוואה'),
      React.createElement(ProgramSearch, { onSelect: (program) => handleProgramSelect(program, true) }),
      renderTable(comparisonData, comparisonSortConfig, true)
    ),
    React.createElement(
      'footer',
      { className: 'footer' },
      'כל הזכויות שמורות לבוכמן פתרונות פיננסים*'
    )
  );
}

function ProgramSearch({ onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [fundType, setFundType] = useState(FUND_TYPES[0]);

  const debouncedSearch = useCallback(
    debounce(async function(searchQuery, selectedFundType) {
      if (searchQuery.length < 2) {
        setResults([]);
        return;
      }
      try {
        const response = await fetch(`/api/search-programs?query=${encodeURIComponent(searchQuery)}&fundType=${encodeURIComponent(selectedFundType)}`);
        const data = await response.json();
        const latestData = Object.values(data.reduce((acc, item) => {
          if (!acc[item.FUND_ID_NAME] || new Date(item.REPORT_PERIOD) > new Date(acc[item.FUND_ID_NAME].REPORT_PERIOD)) {
            acc[item.FUND_ID_NAME] = item;
          }
          return acc;
        }, {}));
        setResults(latestData);
      } catch (error) {
        console.error('Error searching programs:', error);
      }
    }, 300),
    []
  );

  useEffect(() => {
    debouncedSearch(query, fundType);
  }, [query, fundType, debouncedSearch]);

  const handleSelect = function(item) {
    setQuery('');
    setResults([]);
    onSelect(item);
  };

  return React.createElement(
    'div',
    { className: 'program-search' },
    React.createElement(
      'div',
      { className: 'search-controls' },
      React.createElement(
        'select',
        {
          value: fundType,
          onChange: (e) => setFundType(e.target.value),
          className: 'fund-type-select'
        },
        FUND_TYPES.map((type) =>
          React.createElement('option', { key: type, value: type }, type)
        )
      ),
      React.createElement('input', {
        type: 'text',
        value: query,
        onChange: (e) => setQuery(e.target.value),
        placeholder: 'חפש שם תכנית או מספר קופה',
        className: 'program-search-input'
      })
    ),
    results.length > 0 &&
      React.createElement(
        'ul',
        { className: 'program-search-results' },
        results.map((item) =>
          React.createElement(
            'li',
            { key: item.FUND_ID, onClick: () => handleSelect(item) },
            `${item.FUND_ID_NAME} - ${formatReportPeriod(item.REPORT_PERIOD)}`
          )
        )
      )
  );
}

ReactDOM.render(React.createElement(App), document.getElementById('root'));