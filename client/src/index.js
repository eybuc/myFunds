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

const ProgramSearch = ({ onSelect }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [fundType, setFundType] = useState(FUND_TYPES[0]);

  const debouncedSearch = useCallback(
    debounce(async (searchQuery, selectedFundType) => {
      if (searchQuery.length < 2) {
        setResults([]);
        return;
      }
      try {
        const response = await fetch(`/api/search-programs?query=${encodeURIComponent(searchQuery)}&fundType=${encodeURIComponent(selectedFundType)}`);
        const data = await response.json();
        setResults(data);
      } catch (error) {
        console.error('Error searching programs:', error);
      }
    }, 300),
    []
  );

  useEffect(() => {
    debouncedSearch(query, fundType);
  }, [query, fundType, debouncedSearch]);

  const handleSelect = (item) => {
    setQuery('');
    setResults([]);
    onSelect(item);
  };

  return (
    <div className="program-search">
      <div className="search-controls">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חפש שם תכנית או מספר קופה"
          className="program-search-input"
        />
        <select 
          value={fundType} 
          onChange={(e) => setFundType(e.target.value)}
          className="fund-type-select"
        >
          {FUND_TYPES.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </div>
      {results.length > 0 && (
        <ul className="program-search-results">
          {results.map((item) => (
            <li key={item.FUND_ID} onClick={() => handleSelect(item)}>
              {item.FUND_ID_NAME} - {item.REPORT_PERIOD}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const DataTable = () => {
  const [data, setData] = useState([]);
  const [showDateRange, setShowDateRange] = useState(false);
  const [startMonth, setStartMonth] = useState('');
  const [startYear, setStartYear] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const [endYear, setEndYear] = useState('');

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 30 }, (_, i) => currentYear - i);

  const handleProgramSelect = async (selectedProgram) => {
    try {
      const response = await fetch(`/api/search?fundClassification=${encodeURIComponent(selectedProgram.FUND_CLASSIFICATION)}&fundId=${encodeURIComponent(selectedProgram.FUND_ID)}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const fundData = await response.json();
      setData([...data, { ...fundData, sum: '' }]);
    } catch (error) {
      console.error('Error fetching fund data:', error);
    }
  };

  const handleDelete = (index) => {
    setData(data.filter((_, i) => i !== index));
  };

  const handleSumChange = (index, value) => {
    const newData = [...data];
    newData[index].sum = value;
    setData(newData);
  };

  const formatPercentage = (value, divideBy100 = false) => {
    if (value === null || value === undefined || isNaN(value)) return 'N/A';
    const percentage = divideBy100 ? value : value * 100;
    return `${percentage.toFixed(2)}%`;
  };

  const calculateExposure = (value, totalAssets) => {
    if (value === null || totalAssets === null || totalAssets === 0) return 'N/A';
    return formatPercentage(value / totalAssets);
  };

  const calculateWeightedSum = (field) => {
    const totalSum = data.reduce((acc, item) => acc + (parseFloat(item.sum) || 0), 0);
    const weightedSum = data.reduce((acc, item) => {
      const sum = parseFloat(item.sum) || 0;
      const value = parseFloat(item[field]) || 0;
      return acc + (value * sum) / item.TOTAL_ASSETS;
    }, 0);
    return totalSum > 0 ? formatPercentage(weightedSum / totalSum) : 'N/A';
  };

  const handleSearch = async () => {
    const startDate = startMonth && startYear ? `${startYear}-${String(MONTHS.indexOf(startMonth) + 1).padStart(2, '0')}-01` : '';
    const endDate = endMonth && endYear ? `${endYear}-${String(MONTHS.indexOf(endMonth) + 1).padStart(2, '0')}-01` : '';
    
    if (!startDate || !endDate) {
      alert('Please select both start and end dates');
      return;
    }

    const fundIds = data.map(item => item.FUND_ID);
    
    try {
      const response = await fetch('/api/update-fund-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fundIds, startDate, endDate }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const updatedData = await response.json();
      setData(updatedData);
    } catch (error) {
      console.error('Error updating fund data:', error);
    }
  };

  return (
    <div className="container">
      <h1>נתוני קופות גמל, פוליסות ופנסיה</h1>
      <ProgramSearch onSelect={handleProgramSelect} />
      <div className="date-range-container">
        <button onClick={() => setShowDateRange(!showDateRange)} className="date-range-button">
          תאריכים לפי בחירה
        </button>
        {showDateRange && (
          <>
            <div className="date-input">
              <label>מתאריך:</label>
              <select 
                value={startMonth} 
                onChange={(e) => setStartMonth(e.target.value)}
                className="month-select"
              >
                <option value="">חודש</option>
                {MONTHS.map((month) => (
                  <option key={month} value={month}>{month}</option>
                ))}
              </select>
              <input
                type="text"
                list="years"
                value={startYear}
                onChange={(e) => setStartYear(e.target.value)}
                placeholder="שנה"
                className="year-input"
              />
            </div>
            <div className="date-input">
              <label>עד תאריך:</label>
              <select 
                value={endMonth} 
                onChange={(e) => setEndMonth(e.target.value)}
                className="month-select"
              >
                <option value="">חודש</option>
                {MONTHS.map((month) => (
                  <option key={month} value={month}>{month}</option>
                ))}
              </select>
              <input
                type="text"
                list="years"
                value={endYear}
                onChange={(e) => setEndYear(e.target.value)}
                placeholder="שנה"
                className="year-input"
              />
            </div>
            <button onClick={handleSearch} className="search-button">חפש</button>
          </>
        )}
      </div>
      <datalist id="years">
        {years.map((year) => (
          <option key={year} value={year} />
        ))}
      </datalist>
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>שם תכנית</th>
              <th>סוג קופה</th>
              <th>סכום</th>
              <th>TWR לתקופה</th>
              <th>תשואה שנה אחרונה</th>
              <th>ממוצעת 3 שנים</th>
              <th>ממוצעת 5 שנים</th>
              <th>חשיפה למניות</th>
              <th>חשיפה למט"ח</th>
              <th>חשיפה לחו"ל</th>
              <th>תאריך עדכון</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr key={index}>
                <td>{item.FUND_ID_NAME}</td>
                <td>{item.FUND_CLASSIFICATION}</td>
                <td>
                  <input
                    type="number"
                    value={item.sum}
                    onChange={(e) => handleSumChange(index, e.target.value)}
                    className="sum-input"
                  />
                </td>
                <td>{formatPercentage(item.TWR)}</td>
                <td>{formatPercentage(item.YEAR_TO_DATE_YIELD, true)}</td>
                <td>{formatPercentage(item.AVG_ANNUAL_YIELD_TRAILING_3YRS, true)}</td>
                <td>{formatPercentage(item.AVG_ANNUAL_YIELD_TRAILING_5YRS, true)}</td>
                <td>{calculateExposure(item.STOCK_MARKET_EXPOSURE, item.TOTAL_ASSETS)}</td>
                <td>{calculateExposure(item.FOREIGN_CURRENCY_EXPOSURE, item.TOTAL_ASSETS)}</td>
                <td>{calculateExposure(item.FOREIGN_EXPOSURE, item.TOTAL_ASSETS)}</td>
                <td>{item.REPORT_PERIOD}</td>
                <td>
                  <button onClick={() => handleDelete(index)}>מחק</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan="7">סה"כ משוקלל:</td>
              <td>{calculateWeightedSum('STOCK_MARKET_EXPOSURE')}</td>
              <td>{calculateWeightedSum('FOREIGN_CURRENCY_EXPOSURE')}</td>
              <td>{calculateWeightedSum('FOREIGN_EXPOSURE')}</td>
              <td colSpan="2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

const App = () => {
  return (
    <React.StrictMode>
      <DataTable />
    </React.StrictMode>
  );
};

function debounce(func, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

ReactDOM.render(<App />, document.getElementById('root'));
