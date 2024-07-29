const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const cron = require('node-cron');
const fetch = require('node-fetch');

const app = express();
const port = 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

console.log('Starting the server...');

// Initialize SQLite database
const db = new sqlite3.Database('./funds.db', (err) => {
  if (err) {
    console.error('Error opening database', err);
  } else {
    console.log('Connected to the SQLite database.');
    initializeTables(() => {
      checkAndLoadData();
    });
  }
});

// Initialize tables
function initializeTables(callback) {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS $TABLE_NAME (
      FUND_ID TEXT,
      FUND_CLASSIFICATION TEXT,
      FUND_NAME TEXT,
      FUND_ID_NAME TEXT,
      FUND_TRACK_NAME TEXT,
      YEAR_TO_DATE_YIELD REAL,
      AVG_ANNUAL_YIELD_TRAILING_3YRS REAL,
      AVG_ANNUAL_YIELD_TRAILING_5YRS REAL,
      STOCK_MARKET_EXPOSURE REAL,
      FOREIGN_CURRENCY_EXPOSURE REAL,
      FOREIGN_EXPOSURE REAL,
      TOTAL_ASSETS REAL,
      REPORT_PERIOD TEXT,
      MONTHLY_YIELD REAL,
      PRIMARY KEY (FUND_ID, REPORT_PERIOD)
    )
  `;

  db.serialize(() => {
    db.run(createTableQuery.replace('$TABLE_NAME', 'gemel'), (err) => {
      if (err) console.error('Error creating gemel table:', err);
    });
    db.run(createTableQuery.replace('$TABLE_NAME', 'policies'), (err) => {
      if (err) console.error('Error creating policies table:', err);
    });
    db.run(createTableQuery.replace('$TABLE_NAME', 'pension'), (err) => {
      if (err) console.error('Error creating pension table:', err);
      callback();
    });
  });
}

// Resource IDs
const resourceIds = {
  gemel: [
    '91c849ed-ddc4-472b-bd09-0f5486cea35c',
    '2016d770-f094-4a2e-983e-797c26479720',
    'a30dcbea-a1d2-482c-ae29-8f781f5025fb'
  ],
  policies: [
    '584e6b69-174f-46c9-b8db-03925b4c68c6',
    '672090ba-7893-4496-a07c-dc7e822cbf18',
    'c6c62cc7-fe02-4b18-8f3e-813abfbb4647'
  ],
  pension: [
    'a66926f3-e396-4984-a4db-75486751c2f7',
    '4694d5a7-5284-4f3d-a2cb-5887f43fb55e',
    '6d47d6b5-cb08-488b-b333-f1e717b1e1bd'
  ]
};

// Function to fetch data from API and update database
async function updateDataFromAPI(resourceId, tableName) {
  let offset = 0;
  const limit = 1000;
  let totalRecords = 0;

  while (true) {
    const url = `https://data.gov.il/api/3/action/datastore_search?resource_id=${resourceId}&limit=${limit}&offset=${offset}`;
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.result && data.result.records) {
        const records = data.result.records;
        
        if (records.length === 0) {
          break; // No more records to fetch
        }

        // Begin transaction
        db.run('BEGIN TRANSACTION');
        
        records.forEach(record => {
          const fundIdName = `${record.FUND_ID} - ${record.FUND_NAME}`;
          const sql = `INSERT OR REPLACE INTO ${tableName} (
            FUND_ID, FUND_CLASSIFICATION, FUND_NAME, FUND_ID_NAME, FUND_TRACK_NAME,
            YEAR_TO_DATE_YIELD, AVG_ANNUAL_YIELD_TRAILING_3YRS, AVG_ANNUAL_YIELD_TRAILING_5YRS,
            STOCK_MARKET_EXPOSURE, FOREIGN_CURRENCY_EXPOSURE, FOREIGN_EXPOSURE,
            TOTAL_ASSETS, REPORT_PERIOD, MONTHLY_YIELD
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
          
          db.run(sql,
          [
            record.FUND_ID,
            record.FUND_CLASSIFICATION,
            record.FUND_NAME,
            fundIdName,
            record.FUND_TRACK_NAME,
            record.YEAR_TO_DATE_YIELD,
            record.AVG_ANNUAL_YIELD_TRAILING_3YRS,
            record.AVG_ANNUAL_YIELD_TRAILING_5YRS,
            record.STOCK_MARKET_EXPOSURE,
            record.FOREIGN_CURRENCY_EXPOSURE,
            record.FOREIGN_EXPOSURE,
            record.TOTAL_ASSETS,
            record.REPORT_PERIOD,
            record.MONTHLY_YIELD || 0 // Use 0 if MONTHLY_YIELD is not present
          ]);
        });
        
        // Commit transaction
        db.run('COMMIT');
        
        totalRecords += records.length;
        offset += limit;
        console.log(`Updated ${totalRecords} records from resource ${resourceId} in table ${tableName}`);
      } else {
        break; // No more data to fetch
      }
    } catch (error) {
      console.error('Error fetching data from API:', error);
      db.run('ROLLBACK');
      break;
    }
  }
}

// Function to load all data
async function loadAllData() {
  for (const [tableName, ids] of Object.entries(resourceIds)) {
    for (const resourceId of ids) {
      await updateDataFromAPI(resourceId, tableName);
    }
  }
  console.log('Data load complete');
}

// Check if data exists and load if necessary
function checkAndLoadData() {
  db.get("SELECT COUNT(*) as count FROM gemel", [], (err, row) => {
    if (err) {
      console.error("Error checking data:", err);
      loadAllData(); // Load data even if there's an error
    } else if (row.count === 0) {
      console.log("Database is empty. Loading initial data...");
      loadAllData();
    } else {
      console.log("Data already exists in the database. Updating data...");
      loadAllData();
    }
  });
}

// Schedule daily updates at midnight
cron.schedule('0 0 * * *', () => {
  console.log('Running daily update');
  loadAllData();
});

// New endpoint for dynamic search
app.get('/api/search-programs', (req, res) => {
  const { query, fundType } = req.query;
  console.log('Received search request:', { query, fundType });
  
  let tableName;
  if (['קרנות חדשות', 'קרנות כלליות'].includes(fundType)) {
    tableName = 'pension';
  } else if (['פוליסות שהונפקו החל משנת 2004', 'פוליסות שהונפקו בשנים 1990-1991', 'פוליסות שהונפקו בשנים 1992-2003'].includes(fundType)) {
    tableName = 'policies';
  } else {
    tableName = 'gemel';
  }
  console.log('Searching in table:', tableName);

  const sql = `
    SELECT FUND_ID_NAME, FUND_CLASSIFICATION, FUND_ID, REPORT_PERIOD
    FROM ${tableName}
    WHERE FUND_CLASSIFICATION = ? 
      AND (FUND_ID_NAME LIKE ? OR FUND_ID LIKE ?)
    ORDER BY REPORT_PERIOD DESC
    LIMIT 15
  `;

  const params = [fundType, `%${query}%`, `%${query}%`];

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('Error searching programs:', err);
      res.status(500).json({ error: 'Internal server error' });
    } else {
      console.log('Search results:', rows);
      res.json(rows);
    }
  });
});

// Updated API endpoint to search for fund data
app.get('/api/search', (req, res) => {
  const { fundClassification, fundId } = req.query;
  
  let tableName;
  if (['קרנות כלליות', 'קרנות חדשות'].includes(fundClassification)) {
    tableName = 'pension';
  } else if (['פוליסות שהונפקו החל משנת 2004', 'פוליסות שהונפקו בשנים 1990-1991', 'פוליסות שהונפקו בשנים 1992-2003'].includes(fundClassification)) {
    tableName = 'policies';
  } else {
    tableName = 'gemel';
  }
  
  const sql = `
    SELECT * FROM ${tableName} 
    WHERE FUND_CLASSIFICATION = ? AND FUND_ID = ?
    ORDER BY REPORT_PERIOD DESC 
    LIMIT 1
  `;

  db.get(sql, [fundClassification, fundId], (err, row) => {
    if (err) {
      console.error('Error querying database:', err);
      res.status(500).json({ error: 'Internal server error' });
    } else if (row) {
      console.log('Found data:', row);
      res.json(row);
    } else {
      console.log('No data found for:', { fundClassification, fundId });
      res.status(404).json({ error: 'No data found' });
    }
  });
});

// New endpoint to calculate TWR and get updated data
app.post('/api/calculate-twr', (req, res) => {
  const { fundIds, startDate, endDate } = req.body;

  if (!fundIds || !Array.isArray(fundIds) || fundIds.length === 0) {
    return res.status(400).json({ error: 'Invalid fund IDs' });
  }

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Invalid date range' });
  }

  const startPeriod = startDate.replace(/-/g, '').substring(0, 6);
  const endPeriod = endDate.replace(/-/g, '').substring(0, 6);

  // First, determine which table each fund belongs to
  const tableSql = `
    SELECT FUND_ID,
      CASE
        WHEN EXISTS(SELECT 1 FROM gemel WHERE FUND_ID = t.FUND_ID) THEN 'gemel'
        WHEN EXISTS(SELECT 1 FROM policies WHERE FUND_ID = t.FUND_ID) THEN 'policies'
        WHEN EXISTS(SELECT 1 FROM pension WHERE FUND_ID = t.FUND_ID) THEN 'pension'
      END AS table_name
    FROM (SELECT DISTINCT FUND_ID FROM (
      SELECT FUND_ID FROM gemel
      UNION ALL
      SELECT FUND_ID FROM policies
      UNION ALL
      SELECT FUND_ID FROM pension
    )) t
    WHERE FUND_ID IN (${fundIds.map(() => '?').join(',')})
  `;

  db.all(tableSql, fundIds, (err, tableResults) => {
    if (err) {
      console.error('Error determining fund tables:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    // Group fund IDs by table
    const fundsByTable = tableResults.reduce((acc, { FUND_ID, table_name }) => {
      if (!acc[table_name]) acc[table_name] = [];
      acc[table_name].push(FUND_ID);
      return acc;
    }, {});

    // Prepare queries for each table
    const queries = Object.entries(fundsByTable).map(([tableName, tableFundIds]) => {
      const tablePlaceholders = tableFundIds.map(() => '?').join(',');
      return {
        sql: `
          SELECT *
          FROM ${tableName}
          WHERE FUND_ID IN (${tablePlaceholders})
            AND REPORT_PERIOD BETWEEN ? AND ?
          ORDER BY FUND_ID, REPORT_PERIOD
        `,
        params: [...tableFundIds, startPeriod, endPeriod]
      };
    });

    // Execute all queries
    Promise.all(queries.map(query => 
      new Promise((resolve, reject) => {
        db.all(query.sql, query.params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      })
    )).then(results => {
      // Combine results from all queries
      const allData = results.flat();
      const processedData = processData(allData, startPeriod, endPeriod);
      res.json(processedData);
    }).catch(error => {
      console.error('Error fetching data for TWR calculation:', error);
      res.status(500).json({ error: 'Internal server error' });
    });
  });
});

function processData(data, startPeriod, endPeriod) {
  const fundData = {};
  data.forEach(row => {
    if (!fundData[row.FUND_ID]) {
      fundData[row.FUND_ID] = {
        yields: [],
        latestData: null,
        earliestPeriod: row.REPORT_PERIOD
      };
    }
    fundData[row.FUND_ID].yields.push(row);
    if (row.REPORT_PERIOD === endPeriod) {
      fundData[row.FUND_ID].latestData = row;
    }
    if (row.REPORT_PERIOD < fundData[row.FUND_ID].earliestPeriod) {
      fundData[row.FUND_ID].earliestPeriod = row.REPORT_PERIOD;
    }
  });

  return Object.entries(fundData).map(([fundId, { yields, latestData, earliestPeriod }]) => {
    yields.sort((a, b) => a.REPORT_PERIOD.localeCompare(b.REPORT_PERIOD));
    
    const relevantYields = yields.filter(yield => 
      yield.REPORT_PERIOD >= startPeriod && yield.REPORT_PERIOD <= endPeriod
    );

    const twr = relevantYields.reduce((acc, yield) => {
      return acc * (1 + (parseFloat(yield.MONTHLY_YIELD) || 0) / 100);
    }, 1);

    const twrValue = relevantYields.length > 0 ? ((twr - 1) * 100).toFixed(2) : 'N/A';

    return {
      FUND_ID: fundId,
      FUND_ID_NAME: latestData ? latestData.FUND_ID_NAME : 'N/A',
      FUND_CLASSIFICATION: latestData ? latestData.FUND_CLASSIFICATION : 'N/A',
      TWR: twrValue,
      YEAR_TO_DATE_YIELD: latestData ? latestData.YEAR_TO_DATE_YIELD : 'N/A',
      AVG_ANNUAL_YIELD_TRAILING_3YRS: latestData ? latestData.AVG_ANNUAL_YIELD_TRAILING_3YRS : 'N/A',
      AVG_ANNUAL_YIELD_TRAILING_5YRS: latestData ? latestData.AVG_ANNUAL_YIELD_TRAILING_5YRS : 'N/A',
      STOCK_MARKET_EXPOSURE: latestData ? latestData.STOCK_MARKET_EXPOSURE : 'N/A',
      FOREIGN_CURRENCY_EXPOSURE: latestData ? latestData.FOREIGN_CURRENCY_EXPOSURE : 'N/A',
      FOREIGN_EXPOSURE: latestData ? latestData.FOREIGN_EXPOSURE : 'N/A',
      TOTAL_ASSETS: latestData ? latestData.TOTAL_ASSETS : 'N/A',
      REPORT_PERIOD: endPeriod,
      EARLIEST_PERIOD: earliestPeriod
    };
  });
}

app.post('/api/get-latest-fund-data', (req, res) => {
  const { fundIds } = req.body;

  if (!fundIds || !Array.isArray(fundIds) || fundIds.length === 0) {
    return res.status(400).json({ error: 'Invalid fund IDs' });
  }

  const placeholders = fundIds.map(() => '?').join(',');
  
  // First, determine which table each fund belongs to
  const tableSql = `
    SELECT FUND_ID,
      CASE
        WHEN EXISTS(SELECT 1 FROM gemel WHERE FUND_ID = t.FUND_ID) THEN 'gemel'
        WHEN EXISTS(SELECT 1 FROM policies WHERE FUND_ID = t.FUND_ID) THEN 'policies'
        WHEN EXISTS(SELECT 1 FROM pension WHERE FUND_ID = t.FUND_ID) THEN 'pension'
      END AS table_name
    FROM (SELECT DISTINCT FUND_ID FROM (
      SELECT FUND_ID FROM gemel
      UNION ALL
      SELECT FUND_ID FROM policies
      UNION ALL
      SELECT FUND_ID FROM pension
    )) t
    WHERE FUND_ID IN (${placeholders})
  `;

  db.all(tableSql, fundIds, (err, tableResults) => {
    if (err) {
      console.error('Error determining fund tables:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    // Group fund IDs by table
    const fundsByTable = tableResults.reduce((acc, { FUND_ID, table_name }) => {
      if (!acc[table_name]) acc[table_name] = [];
      acc[table_name].push(FUND_ID);
      return acc;
    }, {});

    // Prepare queries for each table
    const queries = Object.entries(fundsByTable).map(([tableName, tableFundIds]) => {
      const tablePlaceholders = tableFundIds.map(() => '?').join(',');
      return {
        sql: `
          SELECT t1.*
          FROM ${tableName} t1
          INNER JOIN (
            SELECT FUND_ID, MAX(REPORT_PERIOD) as max_period
            FROM ${tableName}
            WHERE FUND_ID IN (${tablePlaceholders})
            GROUP BY FUND_ID
          ) t2 ON t1.FUND_ID = t2.FUND_ID AND t1.REPORT_PERIOD = t2.max_period
        `,
        params: tableFundIds
      };
    });

    // Execute all queries
    Promise.all(queries.map(query => 
      new Promise((resolve, reject) => {
        db.all(query.sql, query.params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      })
    )).then(results => {
      // Combine results from all queries
      const allData = results.flat();
      res.json(allData);
    }).catch(error => {
      console.error('Error fetching latest fund data:', error);
      res.status(500).json({ error: 'Internal server error' });
    });
  });
});
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});