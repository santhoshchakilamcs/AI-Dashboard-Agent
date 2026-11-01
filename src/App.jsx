import React, { useState, useEffect, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

// SQL.js will be loaded dynamically
let SQL = null;
let db = null;

const initializeSQL = async () => {
  if (!SQL) {
    try {
      const initSqlJs = (await import('sql.js')).default;
      SQL = await initSqlJs({
        locateFile: file => `https://sql.js.org/dist/${file}`
      });
    } catch (error) {
      console.warn('SQL.js initialization failed:', error);
      return null;
    }
  }
  return SQL;
};

// Theme configurations
const themes = {
  purple: {
    name: 'Purple Tech',
    background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)',
    cardBg: 'rgba(99, 102, 241, 0.1)',
    cardBorder: 'rgba(99, 102, 241, 0.3)',
    accent: '#818cf8',
    text: '#e0e7ff',
    subtext: '#a5b4fc',
    colors: ['#818cf8', '#a78bfa', '#c4b5fd', '#6366f1', '#8b5cf6', '#7c3aed']
  },
  green: {
    name: 'Green Finance',
    background: 'linear-gradient(135deg, #14532d 0%, #166534 50%, #14532d 100%)',
    cardBg: 'rgba(34, 197, 94, 0.1)',
    cardBorder: 'rgba(34, 197, 94, 0.3)',
    accent: '#4ade80',
    text: '#dcfce7',
    subtext: '#86efac',
    colors: ['#4ade80', '#22c55e', '#16a34a', '#15803d', '#84cc16', '#a3e635']
  },
  dark: {
    name: 'Dark Modern',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
    cardBg: 'rgba(100, 255, 218, 0.05)',
    cardBorder: 'rgba(100, 255, 218, 0.2)',
    accent: '#64ffda',
    text: '#e2e8f0',
    subtext: '#94a3b8',
    colors: ['#64ffda', '#22d3ee', '#38bdf8', '#60a5fa', '#818cf8', '#a78bfa']
  },
  red: {
    name: 'Red Bold',
    background: 'linear-gradient(135deg, #450a0a 0%, #7f1d1d 50%, #450a0a 100%)',
    cardBg: 'rgba(239, 68, 68, 0.1)',
    cardBorder: 'rgba(239, 68, 68, 0.3)',
    accent: '#f87171',
    text: '#fecaca',
    subtext: '#fca5a5',
    colors: ['#f87171', '#ef4444', '#dc2626', '#fb923c', '#fbbf24', '#facc15']
  },
  blue: {
    name: 'Blue Corporate',
    background: 'linear-gradient(135deg, #0c4a6e 0%, #075985 50%, #0c4a6e 100%)',
    cardBg: 'rgba(56, 189, 248, 0.1)',
    cardBorder: 'rgba(56, 189, 248, 0.3)',
    accent: '#38bdf8',
    text: '#e0f2fe',
    subtext: '#7dd3fc',
    colors: ['#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#22d3ee', '#06b6d4']
  }
};

const App = () => {
  const [currentTheme, setCurrentTheme] = useState('dark');
  const [data, setData] = useState(null);
  const [columns, setColumns] = useState([]);
  const [fileName, setFileName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [charts, setCharts] = useState([]);
  const chartRefs = useRef({}); // chart id -> ECharts instance, for Save PNG
  const [kpis, setKpis] = useState([]);
  const [view, setView] = useState('upload'); // upload, explore, dashboard
  const [query, setQuery] = useState('');
  // New: Conversational Q&A state
  const [chatMessages, setChatMessages] = useState([]);
  const [suggestedQuestions, setSuggestedQuestions] = useState([]);
  const [columnStats, setColumnStats] = useState([]);
  const [agentActivity, setAgentActivity] = useState([]);
  const [dataAnalysis, setDataAnalysis] = useState(null);
  const [isAutoBuildRunning, setIsAutoBuildRunning] = useState(false);
  const [serverStatus, setServerStatus] = useState('checking');
  const [sqlDb, setSqlDb] = useState(null);
  const [queryResults, setQueryResults] = useState(null);
  const [relationships, setRelationships] = useState(null);
  const fileInputRef = useRef(null);

  const theme = themes[currentTheme];

  // Detect relationships between columns
  const detectRelationships = (data, columns, columnStats) => {
    const relationships = {
      dimensions: [],        // Categorical columns for grouping
      measures: [],          // Numeric columns for aggregation
      dateHierarchy: null,   // Date column with hierarchy info
      potentialKeys: [],     // Columns that could be primary/foreign keys
      hierarchies: [],       // Parent-child relationships (e.g., Country > Region > City)
      correlations: [],      // Numeric column correlations
      segmentations: [],     // Good columns for segmenting data
      calculatedFields: [],  // Suggested calculated fields
      geographicColumns: [], // Columns that contain geographic data
      transactionPattern: null // Invoice/Order + LineItems pattern
    };

    const statsMap = {};
    columnStats.forEach(s => statsMap[s.name] = s);

    // Detect potential calculated field opportunities based on DATA PATTERNS
    const numericCols = columnStats.filter(s => s.isNumeric && s.avg !== undefined);
    
    console.log('Numeric columns for calc detection:', numericCols.map(c => ({ name: c.name, avg: c.avg?.toFixed(2) })));
    
    // Strategy 1: Look for price-like columns (small decimals) and quantity-like columns (integers)
    // Price columns typically have decimals and values like 1.99, 25.50, etc.
    // Quantity columns typically are whole numbers like 1, 5, 10, 100
    
    if (numericCols.length >= 2) {
      // Sort by average value
      const sortedByAvg = [...numericCols].sort((a, b) => (a.avg || 0) - (b.avg || 0));
      
      // Try different pairs to find meaningful multiplications
      for (let i = 0; i < Math.min(sortedByAvg.length, 3); i++) {
        for (let j = i + 1; j < Math.min(sortedByAvg.length, 4); j++) {
          const col1 = sortedByAvg[i];
          const col2 = sortedByAvg[j];
          
          // Skip if both columns have very similar averages (likely same type of data)
          if (col1.avg && col2.avg && Math.abs(col1.avg - col2.avg) < col1.avg * 0.1) continue;
          
          // Skip if either column looks like an ID (very high cardinality and integer-like)
          const col1LooksLikeId = col1.uniqueCount > data.length * 0.8;
          const col2LooksLikeId = col2.uniqueCount > data.length * 0.8;
          if (col1LooksLikeId || col2LooksLikeId) continue;
          
          // This pair could be price × quantity
          relationships.calculatedFields.push({
            name: `${col1.name}_x_${col2.name}`,
            formula: `${col1.name} * ${col2.name}`,
            description: `${col1.name} (avg: ${col1.avg?.toFixed(2)}) × ${col2.name} (avg: ${col2.avg?.toFixed(2)})`,
            columns: [col1.name, col2.name]
          });
          
          // Only add one calculated field suggestion
          break;
        }
        if (relationships.calculatedFields.length > 0) break;
      }
    }
    
    // Strategy 2: Also suggest subtraction for profit-like calculations
    if (numericCols.length >= 2) {
      const revenuelike = numericCols.filter(c => c.sum && c.sum > 10000);
      const costLike = numericCols.filter(c => c.sum && c.sum > 1000 && !revenuelike.includes(c));
      
      if (revenuelike.length > 0 && costLike.length > 0) {
        relationships.calculatedFields.push({
          name: `${revenuelike[0].name}_minus_${costLike[0].name}`,
          formula: `${revenuelike[0].name} - ${costLike[0].name}`,
          description: `Difference: ${revenuelike[0].name} - ${costLike[0].name}`,
          columns: [revenuelike[0].name, costLike[0].name]
        });
      }
    }

    // Detect one-to-many patterns (transaction/line item relationships)
    // Look for: high-cardinality ID column + categorical column with fewer unique values
    const idColumns = columnStats.filter(s => 
      (s.isHighCardinality || s.uniqueCount > data.length * 0.1) && 
      s.uniqueCount < data.length // Not fully unique (meaning duplicates exist = one-to-many)
    );
    
    if (idColumns.length > 0) {
      // Find the best ID column (has duplicates, suggesting line items per transaction)
      const transactionCol = idColumns.find(s => {
        const dupeRatio = data.length / s.uniqueCount;
        return dupeRatio > 1.5 && dupeRatio < 100; // Has meaningful duplicates
      });
      
      if (transactionCol) {
        // Calculate average items per transaction
        const counts = {};
        data.slice(0, 5000).forEach(row => {
          const id = row[transactionCol.name];
          if (id) counts[id] = (counts[id] || 0) + 1;
        });
        const avgItems = Object.values(counts).length > 0 
          ? Object.values(counts).reduce((a, b) => a + b, 0) / Object.keys(counts).length 
          : 1;
        
        if (avgItems > 1.2) {
          relationships.transactionPattern = {
            groupColumn: transactionCol.name,
            avgItemsPerGroup: avgItems.toFixed(1),
            uniqueGroups: transactionCol.uniqueCount,
            totalRecords: data.length,
            pattern: 'one-to-many'
          };
        }
      }
    }

    // Detect geographic columns - flexible approach using sample values
    columnStats.forEach(stat => {
      if (stat.isCategorical && stat.uniqueCount >= 2 && stat.uniqueCount <= 250) {
        const samples = (stat.sampleValues || []).map(v => String(v).toLowerCase());
        
        // Check if samples look like country names
        const countryIndicators = ['usa', 'uk', 'united', 'germany', 'france', 'china', 'india', 'canada', 'australia', 'japan', 'brazil', 'spain', 'italy'];
        const hasCountryValues = samples.some(s => countryIndicators.some(c => s.includes(c)));
        
        // Check if samples look like US states
        const stateIndicators = ['california', 'texas', 'florida', 'new york', 'illinois', 'ca', 'tx', 'fl', 'ny'];
        const hasStateValues = samples.some(s => stateIndicators.some(st => s.includes(st)));
        
        if (hasCountryValues || hasStateValues || stat.uniqueCount <= 50) {
          relationships.geographicColumns.push({
            name: stat.name,
            cardinality: stat.uniqueCount,
            likelyType: hasCountryValues ? 'country' : hasStateValues ? 'state' : 'region',
            sampleValues: stat.sampleValues?.slice(0, 5)
          });
        }
      }
    });

    // Identify dimensions and measures
    columnStats.forEach(stat => {
      if (stat.isNumeric && !stat.name.toLowerCase().includes('id')) {
        relationships.measures.push({
          name: stat.name,
          aggregations: ['sum', 'avg', 'min', 'max'],
          hasNegatives: stat.hasNegatives,
          range: stat.max - stat.min
        });
      } else if (stat.isCategorical) {
        relationships.dimensions.push({
          name: stat.name,
          cardinality: stat.uniqueCount,
          isLowCardinality: stat.uniqueCount <= 10,
          sampleValues: stat.sampleValues
        });
      } else if (stat.isDate) {
        relationships.dateHierarchy = {
          column: stat.name,
          levels: ['year', 'quarter', 'month', 'week', 'day']
        };
      }
    });

    // Detect potential primary/foreign keys
    columnStats.forEach(stat => {
      const name = stat.name.toLowerCase();
      const isIdColumn = name.includes('id') || name.includes('key') || name.includes('code');
      const isUniqueOrHighCardinality = stat.uniqueCount > data.length * 0.9 || stat.uniqueCount === data.length;
      
      if (isIdColumn || isUniqueOrHighCardinality) {
        relationships.potentialKeys.push({
          name: stat.name,
          uniqueRatio: stat.uniqueCount / data.length,
          isPrimaryKey: stat.uniqueCount === data.length,
          type: isUniqueOrHighCardinality ? 'primary' : 'foreign'
        });
      }
    });

    // Detect hierarchies (columns that have parent-child relationships)
    const categoricalCols = columnStats.filter(s => s.isCategorical && s.uniqueCount < 100);
    for (let i = 0; i < categoricalCols.length; i++) {
      for (let j = i + 1; j < categoricalCols.length; j++) {
        const parent = categoricalCols[i];
        const child = categoricalCols[j];
        
        // Check if parent has fewer unique values than child (potential hierarchy)
        if (parent.uniqueCount < child.uniqueCount && parent.uniqueCount < 20) {
          // Verify hierarchy: each child value should map to only one parent
          const mapping = {};
          let isHierarchy = true;
          
          for (const row of data.slice(0, 500)) {
            const childVal = row[child.name];
            const parentVal = row[parent.name];
            if (childVal && parentVal) {
              if (mapping[childVal] && mapping[childVal] !== parentVal) {
                isHierarchy = false;
                break;
              }
              mapping[childVal] = parentVal;
            }
          }
          
          if (isHierarchy && Object.keys(mapping).length > 5) {
            relationships.hierarchies.push({
              parent: parent.name,
              child: child.name,
              parentCardinality: parent.uniqueCount,
              childCardinality: child.uniqueCount
            });
          }
        }
      }
    }

    // Calculate correlations between numeric columns (sample-based for performance)
    const numericColsForCorr = columnStats.filter(s => s.isNumeric);
    if (numericColsForCorr.length >= 2) {
      const sampleData = data.slice(0, 1000);
      
      for (let i = 0; i < numericColsForCorr.length && i < 5; i++) {
        for (let j = i + 1; j < numericColsForCorr.length && j < 5; j++) {
          const col1 = numericColsForCorr[i].name;
          const col2 = numericColsForCorr[j].name;
          
          const pairs = sampleData
            .map(row => [parseFloat(row[col1]), parseFloat(row[col2])])
            .filter(([a, b]) => !isNaN(a) && !isNaN(b));
          
          if (pairs.length > 50) {
            const correlation = calculateCorrelation(pairs);
            if (Math.abs(correlation) > 0.5) {
              relationships.correlations.push({
                column1: col1,
                column2: col2,
                correlation: correlation,
                strength: Math.abs(correlation) > 0.8 ? 'strong' : 'moderate',
                direction: correlation > 0 ? 'positive' : 'negative'
              });
            }
          }
        }
      }
    }

    // Identify good segmentation columns (low cardinality dimensions)
    relationships.segmentations = relationships.dimensions
      .filter(d => d.cardinality >= 2 && d.cardinality <= 10)
      .map(d => d.name);

    return relationships;
  };

  // Calculate Pearson correlation coefficient
  const calculateCorrelation = (pairs) => {
    const n = pairs.length;
    const sum1 = pairs.reduce((a, p) => a + p[0], 0);
    const sum2 = pairs.reduce((a, p) => a + p[1], 0);
    const sum1Sq = pairs.reduce((a, p) => a + p[0] * p[0], 0);
    const sum2Sq = pairs.reduce((a, p) => a + p[1] * p[1], 0);
    const pSum = pairs.reduce((a, p) => a + p[0] * p[1], 0);
    
    const num = pSum - (sum1 * sum2 / n);
    const den = Math.sqrt((sum1Sq - sum1 * sum1 / n) * (sum2Sq - sum2 * sum2 / n));
    
    return den === 0 ? 0 : num / den;
  };

  // Initialize SQL database with the data
  const initializeSqlDatabase = async (data, columns) => {
    try {
      const sqlInstance = await initializeSQL();
      if (!sqlInstance) {
        console.warn('SQL.js not available, skipping database initialization');
        return null;
      }
      db = new sqlInstance.Database();
      
      // Determine column types for SQL
      const columnTypes = columns.map(col => {
        const sampleValues = data.slice(0, 100).map(row => row[col]).filter(v => v !== null && v !== undefined);
        const numericCount = sampleValues.filter(v => !isNaN(parseFloat(v))).length;
        return numericCount > sampleValues.length * 0.8 ? 'REAL' : 'TEXT';
      });
      
      // Create table
      const createTableSQL = `CREATE TABLE data (${columns.map((col, i) => 
        `"${col.replace(/"/g, '""')}" ${columnTypes[i]}`
      ).join(', ')})`;
      
      db.run(createTableSQL);
      
      // Insert data in batches
      const insertSQL = `INSERT INTO data VALUES (${columns.map(() => '?').join(', ')})`;
      const stmt = db.prepare(insertSQL);
      
      data.forEach(row => {
        const values = columns.map((col, i) => {
          const val = row[col];
          if (val === null || val === undefined || val === '') return null;
          return columnTypes[i] === 'REAL' ? parseFloat(val) || null : String(val);
        });
        stmt.run(values);
      });
      
      stmt.free();
      setSqlDb(db);
      
      return db;
    } catch (error) {
      console.error('SQL initialization error:', error);
      return null;
    }
  };

  // Execute SQL query and return results
  const executeSqlQuery = (sql) => {
    if (!db) return null;
    
    try {
      const results = db.exec(sql);
      if (results.length === 0) return { columns: [], values: [] };
      
      return {
        columns: results[0].columns,
        values: results[0].values
      };
    } catch (error) {
      console.error('SQL execution error:', error);
      return { error: error.message };
    }
  };

  useEffect(() => {
    checkServerHealth();
  }, []);

  const checkServerHealth = async () => {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setServerStatus(data.hasApiKey ? 'ready' : 'no-key');
    } catch {
      setServerStatus('offline');
    }
  };

  // Generate suggested questions based on column analysis
  const generateSuggestedQuestions = (cols, stats, rowCount) => {
    const questions = [];
    
    // Find different column types
    const numericCols = stats.filter(s => s.isNumeric);
    const categoricalCols = stats.filter(s => s.isCategorical && s.uniqueCount <= 20);
    const dateCols = stats.filter(s => s.isDate);
    const highCardCols = stats.filter(s => s.uniqueCount > 20 && s.uniqueCount < rowCount * 0.5);
    
    // Generate questions based on what we find
    if (numericCols.length > 0 && categoricalCols.length > 0) {
      const num = numericCols[0].name;
      const cat = categoricalCols[0].name;
      questions.push(`What is the total ${num} by ${cat}?`);
      questions.push(`Show me top 10 ${cat} by ${num}`);
      questions.push(`What is the average ${num} per ${cat}?`);
    }
    
    if (numericCols.length >= 2) {
      questions.push(`Calculate ${numericCols[0].name} × ${numericCols[1].name} and show totals`);
    }
    
    if (dateCols.length > 0 && numericCols.length > 0) {
      questions.push(`Show ${numericCols[0].name} trend over time`);
      questions.push(`What is the monthly breakdown of ${numericCols[0].name}?`);
    }
    
    if (categoricalCols.length > 0) {
      questions.push(`Show distribution of ${categoricalCols[0].name}`);
    }
    
    if (highCardCols.length > 0 && numericCols.length > 0) {
      questions.push(`What are the bottom 10 ${highCardCols[0].name} by ${numericCols[0].name}?`);
    }
    
    // Add generic questions
    questions.push(`How many unique records are there?`);
    questions.push(`Show me a summary of all numeric columns`);
    
    return questions.slice(0, 8); // Return max 8 suggestions
  };

  // Process uploaded data and go to explore view
  const processUploadedData = async (parsedData, cols) => {
    setData(parsedData);
    setColumns(cols);
    
    // Compute column statistics
    const stats = cols.map(col => {
      const values = parsedData.map(row => row[col]).filter(v => v !== null && v !== undefined && v !== '');
      const uniqueValues = [...new Set(values)];
      const numericValues = values.map(v => parseFloat(v)).filter(v => !isNaN(v));
      
      const isNumeric = numericValues.length > values.length * 0.8;
      const isDate = !isNumeric && values.slice(0, 20).some(v => {
        const str = String(v);
        return /\d{1,4}[-\/]\d{1,2}[-\/]\d{1,4}/.test(str) || !isNaN(Date.parse(str));
      });
      
      return {
        name: col,
        type: isNumeric ? 'numeric' : isDate ? 'date' : 'text',
        uniqueCount: uniqueValues.length,
        isNumeric,
        isDate,
        isCategorical: !isNumeric && !isDate && uniqueValues.length <= 50,
        sampleValues: uniqueValues.slice(0, 5)
      };
    });
    
    setColumnStats(stats);
    
    // Initialize chat with loading message
    setChatMessages([{
      type: 'system',
      content: `📊 Loaded **${parsedData.length.toLocaleString()} rows** with **${cols.length} columns**.\n\n🤖 **Multi-Agent System** is analyzing your data...`,
      timestamp: new Date()
    }]);
    
    setView('explore');
    setIsLoading(true);
    setAgentActivity([{ name: 'Data Analyst', status: 'running' }]);
    
    // Call multi-agent analysis
    try {
      const response = await fetch('/api/multi-agent/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columns: stats,
          sampleData: parsedData.slice(0, 10),
          rowCount: parsedData.length
        })
      });

      if (response.ok) {
        const result = await response.json();
        setDataAnalysis(result.analysis);
        setSuggestedQuestions(result.suggestedQuestions || []);
        setAgentActivity([{ name: 'Data Analyst', status: 'complete' }]);
        
        // Update chat with analysis results
        setChatMessages([{
          type: 'system',
          content: `📊 **${parsedData.length.toLocaleString()} rows** loaded with **${cols.length} columns**\n\n🎯 **Data Type:** ${result.analysis?.dataType || 'General'}\n📝 **Context:** ${result.analysis?.businessContext || 'Dataset ready for analysis'}\n\n${result.analysis?.calculatedFields?.length > 0 ? `🧮 **Calculated Fields Detected:**\n${result.analysis.calculatedFields.map(f => `• ${f.name} = ${f.formula}`).join('\n')}\n\n` : ''}Ask me questions and I'll create visualizations using my multi-agent AI system!`,
          timestamp: new Date()
        }]);
      } else {
        // Fallback to basic questions
        const questions = generateSuggestedQuestions(cols, stats, parsedData.length);
        setSuggestedQuestions(questions);
        setAgentActivity([{ name: 'Data Analyst', status: 'fallback' }]);
        
        setChatMessages([{
          type: 'system',
          content: `📊 Loaded **${parsedData.length.toLocaleString()} rows** with **${cols.length} columns**. Ask me questions about your data!`,
          timestamp: new Date()
        }]);
      }
    } catch (error) {
      console.error('Multi-agent analysis error:', error);
      const questions = generateSuggestedQuestions(cols, stats, parsedData.length);
      setSuggestedQuestions(questions);
      
      setChatMessages([{
        type: 'system',
        content: `📊 Loaded **${parsedData.length.toLocaleString()} rows** with **${cols.length} columns**. Ask me questions about your data!`,
        timestamp: new Date()
      }]);
    }
    
    setIsLoading(false);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsLoading(true);
    setFileName(file.name);
    setCharts([]); // Reset charts
    setChatMessages([]); // Reset chat

    const ext = file.name.split('.').pop().toLowerCase();

    try {
      if (ext === 'csv') {
        Papa.parse(file, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => {
            processUploadedData(results.data, results.meta.fields || []);
          },
          error: (error) => {
            console.error('Parse error:', error);
            setIsLoading(false);
          }
        });
      } else if (ext === 'xlsx' || ext === 'xls') {
        const reader = new FileReader();
        reader.onload = (e) => {
          const workbook = XLSX.read(e.target.result, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(sheet);
          const cols = Object.keys(jsonData[0] || {});
          processUploadedData(jsonData, cols);
        };
        reader.readAsBinaryString(file);
      } else if (ext === 'json') {
        const reader = new FileReader();
        reader.onload = (e) => {
          const jsonData = JSON.parse(e.target.result);
          const rows = Array.isArray(jsonData) ? jsonData : [jsonData];
          const cols = Object.keys(rows[0] || {});
          processUploadedData(rows, cols);
        };
        reader.readAsText(file);
      }
    } catch (error) {
      console.error('File processing error:', error);
      setIsLoading(false);
    }
  };

  const analyzeData = async () => {
    if (!data || serverStatus !== 'ready') return;

    setIsLoading(true);
    try {
      // Initialize SQL database for querying (optional, won't break if fails)
      try {
        await initializeSqlDatabase(data, columns);
      } catch (sqlErr) {
        console.warn('SQL database initialization skipped:', sqlErr);
      }
      
      // Compute detailed column statistics for better AI understanding
      const columnStats = columns.map(col => {
        const values = data.map(row => row[col]).filter(v => v !== null && v !== undefined && v !== '');
        const uniqueValues = [...new Set(values)];
        const numericValues = values.map(v => parseFloat(v)).filter(v => !isNaN(v));
        
        const isNumeric = numericValues.length > values.length * 0.8;
        const isDate = !isNumeric && values.slice(0, 20).some(v => {
          const str = String(v);
          return /\d{1,4}[-\/]\d{1,2}[-\/]\d{1,4}/.test(str) || !isNaN(Date.parse(str));
        });
        
        const stats = {
          name: col,
          totalValues: values.length,
          uniqueCount: uniqueValues.length,
          nullCount: data.length - values.length,
          sampleValues: uniqueValues.slice(0, 8),
          isNumeric,
          isDate,
          isCategorical: !isNumeric && !isDate && uniqueValues.length <= 50,
          isHighCardinality: uniqueValues.length > 100
        };
        
        if (isNumeric && numericValues.length > 0) {
          stats.min = Math.min(...numericValues);
          stats.max = Math.max(...numericValues);
          stats.sum = numericValues.reduce((a, b) => a + b, 0);
          stats.avg = stats.sum / numericValues.length;
          stats.hasNegatives = stats.min < 0;
        }
        
        return stats;
      });

      // Detect relationships between columns
      const detectedRelationships = detectRelationships(data, columns, columnStats);
      setRelationships(detectedRelationships);
      
      // Log detected relationships for debugging
      console.log('=== DETECTED RELATIONSHIPS ===');
      console.log('Calculated Fields:', detectedRelationships.calculatedFields);
      console.log('Geographic:', detectedRelationships.geographicColumns);
      console.log('Transaction Pattern:', detectedRelationships.transactionPattern);
      console.log('Dimensions:', detectedRelationships.dimensions?.length);
      console.log('Measures:', detectedRelationships.measures?.length);
      console.log('==============================');

      // Get sample rows
      const sampleRows = data.slice(0, 10);
      
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columns,
          columnStats,
          relationships: detectedRelationships,
          sampleRows,
          totalRows: data.length
        })
      });

      if (response.ok) {
        const result = await response.json();
        setAnalysis(result);
        
        // Generate KPIs with proper aggregations (including calculated fields!)
        if (result.suggestedKPIs) {
          const generatedKPIs = result.suggestedKPIs.map(kpi => {
            let value = 0;
            const col = kpi.column;
            const formula = kpi.formula;
            
            // Helper to evaluate formula for a row
            const evalFormula = (formulaStr, row) => {
              if (!formulaStr) return null;
              try {
                let expr = formulaStr;
                // Remove SUM/AVG wrapper if present
                expr = expr.replace(/^(SUM|AVG|COUNT)\s*\(/i, '').replace(/\)$/, '');
                
                const columnPattern = /[A-Za-z_][A-Za-z0-9_]*/g;
                const matches = expr.match(columnPattern) || [];
                
                for (const match of matches) {
                  if (row.hasOwnProperty(match)) {
                    const val = parseFloat(row[match]);
                    if (!isNaN(val)) {
                      expr = expr.replace(new RegExp(`\\b${match}\\b`, 'g'), val);
                    } else {
                      return null;
                    }
                  }
                }
                
                if (/^[\d\s+\-*/().]+$/.test(expr)) {
                  return Function('"use strict"; return (' + expr + ')')();
                }
                return null;
              } catch (e) {
                return null;
              }
            };
            
            // If there's a formula, calculate it
            if (formula) {
              const calculatedValues = data
                .map(row => evalFormula(formula, row))
                .filter(v => v !== null && !isNaN(v));
              
              if (formula.toUpperCase().startsWith('AVG') || kpi.aggregation === 'avg') {
                value = calculatedValues.length > 0 
                  ? calculatedValues.reduce((a, b) => a + b, 0) / calculatedValues.length 
                  : 0;
              } else if (formula.toUpperCase().startsWith('COUNT')) {
                value = calculatedValues.length;
              } else {
                // Default to SUM
                value = calculatedValues.reduce((a, b) => a + b, 0);
              }
            } else {
              // No formula, use column directly
              const validValues = data.filter(row => row[col] !== null && row[col] !== undefined && row[col] !== '');
              const numericValues = validValues.map(row => parseFloat(row[col])).filter(v => !isNaN(v));
              
              switch (kpi.aggregation) {
                case 'sum':
                  value = numericValues.reduce((acc, v) => acc + v, 0);
                  break;
                case 'avg':
                  value = numericValues.length > 0 ? numericValues.reduce((acc, v) => acc + v, 0) / numericValues.length : 0;
                  break;
                case 'count':
                  value = data.length;
                  break;
                case 'countDistinct':
                  value = new Set(validValues.map(row => row[col])).size;
                  break;
                case 'max':
                  value = numericValues.length > 0 ? Math.max(...numericValues) : 0;
                  break;
                case 'min':
                  value = numericValues.length > 0 ? Math.min(...numericValues) : 0;
                  break;
                default:
                  value = data.length;
              }
            }

            const formatValue = (val, format) => {
              if (format === 'currency') {
                return val >= 1000000 
                  ? `$${(val / 1000000).toFixed(2)}M`
                  : val >= 1000 
                    ? `$${(val / 1000).toFixed(1)}K`
                    : `$${val.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
              } else if (format === 'percent') {
                return `${(val * 100).toFixed(1)}%`;
              }
              return val >= 1000000 
                ? `${(val / 1000000).toFixed(2)}M`
                : val.toLocaleString(undefined, { maximumFractionDigits: 0 });
            };

            return {
              ...kpi,
              value: formatValue(value, kpi.format)
            };
          });
          setKpis(generatedKPIs);
        }

        // Generate charts from recommendations
        if (result.recommendations) {
          const generatedCharts = result.recommendations.map((rec, index) => ({
            id: `chart-${index}`,
            ...rec,
            options: generateChartOptions(rec, data, theme)
          }));
          setCharts(generatedCharts);
        }

        setView('dashboard');
      }
    } catch (error) {
      console.error('Analysis error:', error);
    }
    setIsLoading(false);
  };

  // Evaluate calculated field formula for a row
  const evaluateFormula = (formula, row) => {
    if (!formula) return null;
    try {
      // Replace column names with values
      // Handle formulas like "UnitPrice * Quantity", "Price - Cost", etc.
      let expr = formula;
      
      // Find all potential column references (words that might be column names)
      const columnPattern = /[A-Za-z_][A-Za-z0-9_]*/g;
      const matches = formula.match(columnPattern) || [];
      
      for (const match of matches) {
        if (row.hasOwnProperty(match)) {
          const val = parseFloat(row[match]);
          if (!isNaN(val)) {
            expr = expr.replace(new RegExp(`\\b${match}\\b`, 'g'), val);
          } else {
            return null; // Can't evaluate if column value isn't numeric
          }
        }
      }
      
      // Safely evaluate the expression (only allows basic math)
      if (/^[\d\s+\-*/().]+$/.test(expr)) {
        return Function('"use strict"; return (' + expr + ')')();
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  const generateChartOptions = (config, chartData, themeColors) => {
    const { chartType, xAxis, yAxis, title, groupBy, limit = 15, aggregation = 'sum', calculatedField } = config;
    
    // Check if yAxis column is actually numeric
    const yAxisValues = chartData.slice(0, 100).map(row => row[yAxis]);
    const numericYValues = yAxisValues.map(v => parseFloat(v)).filter(v => !isNaN(v));
    const isYAxisNumeric = numericYValues.length > yAxisValues.length * 0.5;
    
    // Auto-detect best aggregation if yAxis isn't numeric
    const effectiveAggregation = !isYAxisNumeric && aggregation !== 'count' && aggregation !== 'countDistinct' 
      ? 'count' 
      : aggregation;
    
    // Aggregate data by xAxis
    const aggregated = {};
    chartData.forEach(row => {
      let key = row[xAxis];
      if (key === null || key === undefined || key === '') {
        key = 'Unknown';
      }
      // Truncate long labels
      if (typeof key === 'string' && key.length > 25) {
        key = key.substring(0, 22) + '...';
      }
      if (!aggregated[key]) {
        aggregated[key] = { count: 0, sum: 0, values: [], uniqueValues: new Set() };
      }
      aggregated[key].count++;
      
      // Track unique values for countDistinct
      if (row[yAxis] !== null && row[yAxis] !== undefined) {
        aggregated[key].uniqueValues.add(row[yAxis]);
      }
      
      // Use calculated field if provided, otherwise use yAxis column
      let numVal;
      if (calculatedField) {
        numVal = evaluateFormula(calculatedField, row);
      } else {
        numVal = parseFloat(row[yAxis]);
      }
      
      if (numVal !== null && !isNaN(numVal)) {
        aggregated[key].sum += numVal;
        aggregated[key].values.push(numVal);
      }
    });

    // Calculate final values based on aggregation type
    let entries = Object.entries(aggregated).map(([key, data]) => {
      let value;
      switch (effectiveAggregation) {
        case 'avg':
          value = data.values.length > 0 ? data.sum / data.values.length : 0;
          break;
        case 'count':
          value = data.count;
          break;
        case 'countDistinct':
          value = data.uniqueValues.size;
          break;
        case 'max':
          value = data.values.length > 0 ? Math.max(...data.values) : 0;
          break;
        case 'min':
          value = data.values.length > 0 ? Math.min(...data.values) : 0;
          break;
        case 'sum':
        default:
          value = data.values.length > 0 ? data.sum : data.count; // Fallback to count if no numeric values
      }
      return { key, value, count: data.count };
    });

    // Sort by value descending and apply limit
    entries.sort((a, b) => b.value - a.value);
    if (limit && entries.length > limit) {
      entries = entries.slice(0, limit);
    }

    const categories = entries.map(e => e.key);
    const values = entries.map(e => e.value);

    const baseOptions = {
      backgroundColor: 'transparent',
      title: {
        text: title,
        left: 'center',
        textStyle: { color: themeColors.text, fontSize: 14 }
      },
      tooltip: {
        trigger: chartType === 'pie' || chartType === 'donut' ? 'item' : 'axis',
        backgroundColor: 'rgba(0,0,0,0.8)',
        textStyle: { color: '#fff' }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      }
    };

    switch (chartType) {
      case 'bar':
        const needsRotation = categories.length > 6 || categories.some(c => String(c).length > 10);
        return {
          ...baseOptions,
          grid: {
            left: '3%',
            right: '4%',
            bottom: needsRotation ? '20%' : '10%',
            containLabel: true
          },
          xAxis: {
            type: 'category',
            data: categories,
            axisLabel: { 
              color: themeColors.subtext, 
              rotate: needsRotation ? 35 : 0,
              fontSize: 11,
              interval: 0,
              formatter: (val) => String(val).length > 15 ? String(val).substring(0, 12) + '...' : val
            },
            axisLine: { lineStyle: { color: themeColors.cardBorder } }
          },
          yAxis: {
            type: 'value',
            axisLabel: { 
              color: themeColors.subtext,
              formatter: (val) => val >= 1000000 ? (val/1000000).toFixed(1) + 'M' : val >= 1000 ? (val/1000).toFixed(0) + 'K' : val
            },
            axisLine: { lineStyle: { color: themeColors.cardBorder } },
            splitLine: { lineStyle: { color: themeColors.cardBorder, opacity: 0.3 } }
          },
          series: [{
            type: 'bar',
            data: values,
            itemStyle: {
              color: {
                type: 'linear',
                x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: themeColors.colors[0] },
                  { offset: 1, color: themeColors.colors[1] }
                ]
              },
              borderRadius: [4, 4, 0, 0]
            },
            label: {
              show: categories.length <= 10,
              position: 'top',
              color: themeColors.subtext,
              fontSize: 10,
              formatter: (params) => params.value >= 1000 ? (params.value/1000).toFixed(0) + 'K' : params.value
            }
          }]
        };

      case 'line':
        // For line charts, try to aggregate by month if xAxis looks like dates
        let lineCategories = categories;
        let lineValues = values;
        
        // Check if we need to aggregate by month (for time series)
        const firstCat = String(categories[0] || '');
        const isDateLike = /\d{1,4}[-\/]\d{1,2}[-\/]\d{1,4}/.test(firstCat) || !isNaN(Date.parse(firstCat));
        
        if (isDateLike && categories.length > 30) {
          // Aggregate by month
          const monthlyData = {};
          chartData.forEach(row => {
            const dateVal = row[xAxis];
            if (dateVal) {
              const date = new Date(dateVal);
              if (!isNaN(date.getTime())) {
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                if (!monthlyData[monthKey]) {
                  monthlyData[monthKey] = { sum: 0, count: 0 };
                }
                const numVal = parseFloat(row[yAxis]);
                if (!isNaN(numVal)) {
                  monthlyData[monthKey].sum += numVal;
                  monthlyData[monthKey].count++;
                }
              }
            }
          });
          
          const sortedMonths = Object.keys(monthlyData).sort();
          lineCategories = sortedMonths.map(m => {
            const [year, month] = m.split('-');
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return `${monthNames[parseInt(month) - 1]} ${year}`;
          });
          lineValues = sortedMonths.map(m => aggregation === 'avg' ? monthlyData[m].sum / monthlyData[m].count : monthlyData[m].sum);
        }
        
        return {
          ...baseOptions,
          grid: {
            left: '3%',
            right: '4%',
            bottom: '15%',
            containLabel: true
          },
          xAxis: {
            type: 'category',
            data: lineCategories,
            axisLabel: { 
              color: themeColors.subtext,
              rotate: lineCategories.length > 12 ? 35 : 0,
              fontSize: 11
            },
            axisLine: { lineStyle: { color: themeColors.cardBorder } }
          },
          yAxis: {
            type: 'value',
            axisLabel: { 
              color: themeColors.subtext,
              formatter: (val) => val >= 1000000 ? (val/1000000).toFixed(1) + 'M' : val >= 1000 ? (val/1000).toFixed(0) + 'K' : val
            },
            axisLine: { lineStyle: { color: themeColors.cardBorder } },
            splitLine: { lineStyle: { color: themeColors.cardBorder, opacity: 0.3 } }
          },
          series: [{
            type: 'line',
            data: lineValues,
            smooth: true,
            lineStyle: { color: themeColors.accent, width: 3 },
            areaStyle: {
              color: {
                type: 'linear',
                x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: themeColors.accent + '40' },
                  { offset: 1, color: themeColors.accent + '00' }
                ]
              }
            },
            itemStyle: { color: themeColors.accent },
            symbol: lineCategories.length > 20 ? 'none' : 'circle',
            symbolSize: 6
          }]
        };

      case 'pie':
      case 'donut':
        // Limit pie charts to top 8 items for readability
        const pieLimit = Math.min(8, categories.length);
        const pieCategories = categories.slice(0, pieLimit);
        const pieValues = values.slice(0, pieLimit);
        
        // If there are more items, group rest as "Other"
        if (categories.length > pieLimit) {
          const otherSum = values.slice(pieLimit).reduce((a, b) => a + b, 0);
          if (otherSum > 0) {
            pieCategories.push('Other');
            pieValues.push(otherSum);
          }
        }
        
        return {
          ...baseOptions,
          legend: {
            orient: 'vertical',
            right: '5%',
            top: 'center',
            textStyle: { color: themeColors.subtext, fontSize: 12 },
            formatter: (name) => name.length > 20 ? name.substring(0, 17) + '...' : name
          },
          series: [{
            type: 'pie',
            radius: chartType === 'donut' ? ['40%', '70%'] : '70%',
            center: ['40%', '50%'],
            data: pieCategories.map((name, i) => ({
              name: String(name),
              value: pieValues[i],
              itemStyle: { color: themeColors.colors[i % themeColors.colors.length] }
            })),
            label: { 
              color: themeColors.text,
              formatter: '{b}: {d}%',
              fontSize: 11
            },
            emphasis: {
              itemStyle: {
                shadowBlur: 10,
                shadowOffsetX: 0,
                shadowColor: 'rgba(0, 0, 0, 0.5)'
              }
            }
          }]
        };

      case 'scatter':
        return {
          ...baseOptions,
          xAxis: {
            type: 'value',
            axisLabel: { color: themeColors.subtext },
            axisLine: { lineStyle: { color: themeColors.cardBorder } },
            splitLine: { lineStyle: { color: themeColors.cardBorder, opacity: 0.3 } }
          },
          yAxis: {
            type: 'value',
            axisLabel: { color: themeColors.subtext },
            axisLine: { lineStyle: { color: themeColors.cardBorder } },
            splitLine: { lineStyle: { color: themeColors.cardBorder, opacity: 0.3 } }
          },
          series: [{
            type: 'scatter',
            data: chartData.slice(0, 100).map(row => [
              parseFloat(row[xAxis]) || 0,
              parseFloat(row[yAxis]) || 0
            ]),
            itemStyle: { color: themeColors.accent }
          }]
        };

      case 'gauge':
        // Calculate percentage value
        const total = values.reduce((a, b) => a + b, 0);
        const gaugeValue = config.gaugeValue || (total > 0 ? (values[0] / total * 100) : 0);
        return {
          ...baseOptions,
          series: [{
            type: 'gauge',
            startAngle: 200,
            endAngle: -20,
            min: 0,
            max: 100,
            splitNumber: 10,
            center: ['50%', '60%'],
            radius: '90%',
            itemStyle: {
              color: themeColors.accent
            },
            progress: {
              show: true,
              roundCap: true,
              width: 12
            },
            pointer: {
              show: false
            },
            axisLine: {
              roundCap: true,
              lineStyle: {
                width: 12,
                color: [[1, themeColors.cardBorder]]
              }
            },
            axisTick: { show: false },
            splitLine: { show: false },
            axisLabel: { show: false },
            title: {
              show: true,
              offsetCenter: [0, '30%'],
              fontSize: 14,
              color: themeColors.subtext
            },
            detail: {
              fontSize: 32,
              fontWeight: 'bold',
              offsetCenter: [0, '-10%'],
              valueAnimation: true,
              formatter: '{value}%',
              color: themeColors.accent
            },
            data: [{ value: Math.round(gaugeValue), name: config.gaugeLabel || '' }]
          }]
        };

      case 'horizontalBar':
        return {
          ...baseOptions,
          grid: {
            left: '3%',
            right: '10%',
            bottom: '3%',
            top: '15%',
            containLabel: true
          },
          xAxis: {
            type: 'value',
            axisLabel: { 
              color: themeColors.subtext,
              formatter: (val) => val >= 1000000 ? (val/1000000).toFixed(1) + 'M' : val >= 1000 ? (val/1000).toFixed(0) + 'K' : val
            },
            axisLine: { lineStyle: { color: themeColors.cardBorder } },
            splitLine: { lineStyle: { color: themeColors.cardBorder, opacity: 0.3 } }
          },
          yAxis: {
            type: 'category',
            data: categories.slice().reverse(),
            axisLabel: { 
              color: themeColors.text,
              fontSize: 11,
              formatter: (val) => String(val).length > 20 ? String(val).substring(0, 17) + '...' : val
            },
            axisLine: { lineStyle: { color: themeColors.cardBorder } }
          },
          series: [{
            type: 'bar',
            data: values.slice().reverse(),
            itemStyle: {
              color: {
                type: 'linear',
                x: 0, y: 0, x2: 1, y2: 0,
                colorStops: [
                  { offset: 0, color: themeColors.colors[1] },
                  { offset: 1, color: themeColors.colors[0] }
                ]
              },
              borderRadius: [0, 4, 4, 0]
            },
            label: {
              show: true,
              position: 'right',
              color: themeColors.subtext,
              fontSize: 11,
              formatter: (params) => params.value >= 1000 ? (params.value/1000).toFixed(1) + 'K' : params.value
            }
          }]
        };

      case 'area':
        let areaCategories = categories;
        let areaValues = values;
        
        // For area charts, try to aggregate by month if xAxis looks like dates
        const firstAreaCat = String(categories[0] || '');
        const isAreaDateLike = /\d{1,4}[-\/]\d{1,2}[-\/]\d{1,4}/.test(firstAreaCat) || !isNaN(Date.parse(firstAreaCat));
        
        if (isAreaDateLike && categories.length > 30) {
          const monthlyData = {};
          chartData.forEach(row => {
            const dateVal = row[xAxis];
            if (dateVal) {
              const date = new Date(dateVal);
              if (!isNaN(date.getTime())) {
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                if (!monthlyData[monthKey]) {
                  monthlyData[monthKey] = { sum: 0, count: 0 };
                }
                const numVal = parseFloat(row[yAxis]);
                if (!isNaN(numVal)) {
                  monthlyData[monthKey].sum += numVal;
                  monthlyData[monthKey].count++;
                }
              }
            }
          });
          
          const sortedMonths = Object.keys(monthlyData).sort();
          areaCategories = sortedMonths.map(m => {
            const [year, month] = m.split('-');
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return `${monthNames[parseInt(month) - 1]} ${year}`;
          });
          areaValues = sortedMonths.map(m => monthlyData[m].sum);
        }
        
        return {
          ...baseOptions,
          grid: {
            left: '3%',
            right: '4%',
            bottom: '15%',
            containLabel: true
          },
          xAxis: {
            type: 'category',
            boundaryGap: false,
            data: areaCategories,
            axisLabel: { 
              color: themeColors.subtext,
              rotate: areaCategories.length > 12 ? 35 : 0,
              fontSize: 11
            },
            axisLine: { lineStyle: { color: themeColors.cardBorder } }
          },
          yAxis: {
            type: 'value',
            axisLabel: { 
              color: themeColors.subtext,
              formatter: (val) => val >= 1000000 ? (val/1000000).toFixed(1) + 'M' : val >= 1000 ? (val/1000).toFixed(0) + 'K' : val
            },
            axisLine: { lineStyle: { color: themeColors.cardBorder } },
            splitLine: { lineStyle: { color: themeColors.cardBorder, opacity: 0.3 } }
          },
          series: [{
            type: 'line',
            data: areaValues,
            smooth: true,
            symbol: 'none',
            lineStyle: { color: themeColors.accent, width: 2 },
            areaStyle: {
              color: {
                type: 'linear',
                x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: themeColors.accent + '80' },
                  { offset: 0.5, color: themeColors.accent + '40' },
                  { offset: 1, color: themeColors.accent + '05' }
                ]
              }
            }
          }]
        };

      case 'stackedBar':
        // Group data by xAxis and groupBy column
        const groupByCol = config.groupBy;
        const stackedData = {};
        const groupValues = new Set();
        
        chartData.forEach(row => {
          const xKey = row[xAxis] || 'Unknown';
          const groupKey = groupByCol ? (row[groupByCol] || 'Other') : 'Value';
          groupValues.add(groupKey);
          
          if (!stackedData[xKey]) {
            stackedData[xKey] = {};
          }
          if (!stackedData[xKey][groupKey]) {
            stackedData[xKey][groupKey] = 0;
          }
          const numVal = parseFloat(row[yAxis]);
          if (!isNaN(numVal)) {
            stackedData[xKey][groupKey] += numVal;
          }
        });
        
        const stackedCategories = Object.keys(stackedData).slice(0, limit);
        const groupList = Array.from(groupValues).slice(0, 6);
        
        return {
          ...baseOptions,
          legend: {
            data: groupList,
            top: 30,
            textStyle: { color: themeColors.subtext, fontSize: 11 }
          },
          grid: {
            left: '3%',
            right: '4%',
            bottom: '15%',
            top: '20%',
            containLabel: true
          },
          xAxis: {
            type: 'category',
            data: stackedCategories,
            axisLabel: { 
              color: themeColors.subtext, 
              rotate: stackedCategories.length > 6 ? 35 : 0,
              fontSize: 11
            },
            axisLine: { lineStyle: { color: themeColors.cardBorder } }
          },
          yAxis: {
            type: 'value',
            axisLabel: { 
              color: themeColors.subtext,
              formatter: (val) => val >= 1000 ? (val/1000).toFixed(0) + 'K' : val
            },
            axisLine: { lineStyle: { color: themeColors.cardBorder } },
            splitLine: { lineStyle: { color: themeColors.cardBorder, opacity: 0.3 } }
          },
          series: groupList.map((group, i) => ({
            name: group,
            type: 'bar',
            stack: 'total',
            data: stackedCategories.map(cat => stackedData[cat]?.[group] || 0),
            itemStyle: { 
              color: themeColors.colors[i % themeColors.colors.length],
              borderRadius: i === groupList.length - 1 ? [4, 4, 0, 0] : 0
            }
          }))
        };

      default:
        return baseOptions;
    }
  };

  const handleQuery = async () => {
    if (!query.trim() || serverStatus !== 'ready') return;

    setIsLoading(true);
    try {
      // Get column metadata for AI
      const columnMeta = columns.map(col => {
        const stat = analysis?.columnStats?.find(s => s.name === col) || {};
        return {
          name: col,
          type: stat.isNumeric ? 'numeric' : stat.isDate ? 'date' : 'text',
          sample: data[0]?.[col],
          uniqueCount: stat.uniqueCount
        };
      });

      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: query,
          columns: columnMeta,
          relationships: relationships,
          tableName: 'data'
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        // Execute the SQL query on our local database
        if (result.sql && db) {
          try {
            const sqlResult = executeSqlQuery(result.sql);
            
            if (sqlResult && !sqlResult.error && sqlResult.values?.length > 0) {
              // Create chart from SQL results
              const chartData = sqlResult.values.map(row => {
                const obj = {};
                sqlResult.columns.forEach((col, i) => {
                  obj[col] = row[i];
                });
                return obj;
              });
              
              const newChart = {
                id: `query-chart-${Date.now()}`,
                chartType: result.chartType || 'bar',
                title: result.chartConfig?.title || query,
                description: result.explanation,
                sql: result.sql,
                xAxis: sqlResult.columns[0],
                yAxis: sqlResult.columns[1] || sqlResult.columns[0],
                options: generateChartOptions({
                  chartType: result.chartType || 'horizontalBar',
                  xAxis: sqlResult.columns[0],
                  yAxis: sqlResult.columns[1] || sqlResult.columns[0],
                  title: result.chartConfig?.title || query,
                  limit: 15,
                  aggregation: 'sum'
                }, chartData, theme)
              };
              
              setCharts(prev => [newChart, ...prev]);
              setQueryResults({ sql: result.sql, data: chartData, explanation: result.explanation });
            } else if (sqlResult?.error) {
              console.error('SQL Error:', sqlResult.error);
              // Fall back to chart config approach
              if (result.chartConfig) {
                const newChart = {
                  id: `query-chart-${Date.now()}`,
                  chartType: result.chartType,
                  title: result.chartConfig.title,
                  xAxis: result.chartConfig.xAxis,
                  yAxis: result.chartConfig.yAxis,
                  options: generateChartOptions({
                    chartType: result.chartType,
                    ...result.chartConfig
                  }, data, theme)
                };
                setCharts(prev => [newChart, ...prev]);
              }
            }
          } catch (sqlErr) {
            console.error('SQL execution failed:', sqlErr);
          }
        } else if (result.chartConfig) {
          // Fallback if no SQL
          const newChart = {
            id: `query-chart-${Date.now()}`,
            chartType: result.chartType,
            title: result.chartConfig.title,
            xAxis: result.chartConfig.xAxis,
            yAxis: result.chartConfig.yAxis,
            options: generateChartOptions({
              chartType: result.chartType,
              ...result.chartConfig
            }, data, theme)
          };
          setCharts(prev => [newChart, ...prev]);
        }
      }
    } catch (error) {
      console.error('Query error:', error);
    }
    setIsLoading(false);
    setQuery('');
  };

  const resetDashboard = () => {
    setData(null);
    setColumns([]);
    setFileName('');
    setAnalysis(null);
    setCharts([]);
    setKpis([]);
    setChatMessages([]);
    setSuggestedQuestions([]);
    setColumnStats([]);
    setView('upload');
  };

  // Delete a specific chart
  const deleteChart = (chartId) => {
    setCharts(prev => prev.filter(chart => chart.id !== chartId));
  };

  // Save a chart as a PNG, using its ECharts instance.
  // Requires the chart to have rendered once (onChartReady below).
  const downloadChartAsPNG = (chartId) => {
    const instance = chartRefs.current[chartId];
    if (!instance) return;
    const url = instance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' });
    const a = document.createElement('a');
    a.href = url;
    a.download = `${chartId}.png`;
    a.click();
  };

  // Handle user question in conversational mode - MULTI-AGENT
  const handleAskQuestion = async (question) => {
    if (!question.trim() || serverStatus !== 'ready' || isLoading) return;

    const userQuestion = question.trim();
    setQuery('');
    setIsLoading(true);

    // Add user message to chat
    setChatMessages(prev => [...prev, {
      type: 'user',
      content: userQuestion,
      timestamp: new Date()
    }]);

    // Show agent activity
    setAgentActivity([
      { name: 'Data Analyst', status: 'complete' },
      { name: 'SQL Expert', status: 'running' },
      { name: 'Viz Expert', status: 'pending' }
    ]);

    try {
      // Send to multi-agent system
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userQuestion,
          columns: columnStats.map(c => ({
            name: c.name,
            type: c.type || (c.isNumeric ? 'numeric' : c.isDate ? 'date' : 'text'),
            uniqueCount: c.uniqueCount,
            samples: c.sampleValues
          })),
          rowCount: data.length,
          sampleData: data.slice(0, 5),
          sessionId: fileName // Use filename as session ID for caching
        })
      });

      // Update agent status
      setAgentActivity([
        { name: 'Data Analyst', status: 'complete' },
        { name: 'SQL Expert', status: 'complete' },
        { name: 'Viz Expert', status: 'running' }
      ]);

      if (response.ok) {
        const result = await response.json();
        
        // Update final agent status
        setAgentActivity(result.agents || [
          { name: 'Data Analyst', status: 'complete' },
          { name: 'SQL Expert', status: 'complete' },
          { name: 'Viz Expert', status: 'complete' }
        ]);
        
        // Create chart from AI response
        let newChart = null;
        if (result.chartConfig) {
          newChart = {
            id: `chart-${Date.now()}`,
            chartType: result.chartType || 'bar',
            title: result.chartConfig.title || userQuestion,
            description: result.chartConfig.description || result.answer,
            xAxis: result.chartConfig.xAxis,
            yAxis: result.chartConfig.yAxis,
            calculatedField: result.chartConfig.calculatedField,
            options: generateChartOptions({
              chartType: result.chartType || 'horizontalBar',
              xAxis: result.chartConfig.xAxis,
              yAxis: result.chartConfig.yAxis,
              title: result.chartConfig.title || userQuestion,
              limit: result.chartConfig.limit || 10,
              aggregation: result.chartConfig.aggregation || 'sum',
              calculatedField: result.chartConfig.calculatedField
            }, data, theme)
          };
          
          setCharts(prev => [...prev, newChart]);
        }

        // Build response message
        let responseContent = result.answer || 'I created a visualization for your question.';
        
        // Add design rationale if available
        if (result.designRationale) {
          responseContent += `\n\n💡 *${result.designRationale}*`;
        }

        // Add AI response to chat
        setChatMessages(prev => [...prev, {
          type: 'system',
          content: responseContent,
          sql: result.sql,
          chartId: newChart?.id,
          agents: result.agents,
          insights: result.insights,
          timestamp: new Date()
        }]);
      } else {
        setAgentActivity([]);
        setChatMessages(prev => [...prev, {
          type: 'system',
          content: "Sorry, I couldn't process that question. Please try rephrasing it.",
          timestamp: new Date()
        }]);
      }
    } catch (error) {
      console.error('Ask error:', error);
      setAgentActivity([]);
      setChatMessages(prev => [...prev, {
        type: 'system',
        content: "An error occurred. Please try again.",
        timestamp: new Date()
      }]);
    }
    
    setIsLoading(false);
    setAgentActivity([]);
  };

  /**
   * AUTO-BUILD DASHBOARD
   * Like clicking "Build Dashboard" in Power BI or Tableau
   * Multi-agent system automatically creates a complete dashboard
   */
  const handleAutoBuildDashboard = async () => {
    if (!data || serverStatus !== 'ready' || isAutoBuildRunning) return;

    setIsAutoBuildRunning(true);
    setIsLoading(true);
    
    // Show agent activity
    setAgentActivity([
      { name: 'Data Analyst', status: 'running' },
      { name: 'Dashboard Architect', status: 'pending' },
      { name: 'Insight Generator', status: 'pending' }
    ]);

    setChatMessages(prev => [...prev, {
      type: 'system',
      content: '🏗️ **Building Dashboard Automatically...**\n\nMulti-agent AI system is working like Power BI/Tableau to create your dashboard.',
      timestamp: new Date()
    }]);

    try {
      const response = await fetch('/api/build-dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columns: columnStats.map(c => ({
            name: c.name,
            type: c.type || (c.isNumeric ? 'numeric' : c.isDate ? 'date' : 'text'),
            uniqueCount: c.uniqueCount,
            samples: c.sampleValues
          })),
          sampleData: data.slice(0, 15),
          rowCount: data.length
        })
      });

      // Update agent status
      setAgentActivity([
        { name: 'Data Analyst', status: 'complete' },
        { name: 'Dashboard Architect', status: 'running' },
        { name: 'Insight Generator', status: 'pending' }
      ]);

      if (response.ok) {
        const result = await response.json();
        
        setAgentActivity([
          { name: 'Data Analyst', status: 'complete' },
          { name: 'Dashboard Architect', status: 'complete' },
          { name: 'Insight Generator', status: 'complete' }
        ]);

        if (result.success && result.dashboard) {
          const dashboard = result.dashboard;
          
          // Store the data analysis
          setDataAnalysis(result.dataAnalysis);
          
          // Generate KPIs
          const generatedKPIs = (dashboard.kpis || []).map(kpi => {
            let value = 0;
            
            if (kpi.calculatedField) {
              // Handle calculated fields like UnitPrice * Quantity
              const parts = kpi.calculatedField.split('*').map(p => p.trim());
              if (parts.length === 2) {
                value = data.reduce((sum, row) => {
                  const v1 = parseFloat(row[parts[0]]) || 0;
                  const v2 = parseFloat(row[parts[1]]) || 0;
                  return sum + (v1 * v2);
                }, 0);
              }
            } else if (kpi.measure && kpi.aggregation) {
              const values = data.map(row => parseFloat(row[kpi.measure])).filter(v => !isNaN(v));
              switch (kpi.aggregation) {
                case 'sum':
                  value = values.reduce((a, b) => a + b, 0);
                  break;
                case 'avg':
                  value = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
                  break;
                case 'count':
                  value = data.length;
                  break;
                case 'countDistinct':
                  value = new Set(data.map(row => row[kpi.measure])).size;
                  break;
                case 'max':
                  value = Math.max(...values);
                  break;
                case 'min':
                  value = Math.min(...values);
                  break;
                default:
                  value = values.reduce((a, b) => a + b, 0);
              }
            }
            
            // Format value
            let formattedValue = value;
            if (kpi.format === 'currency') {
              formattedValue = value >= 1000000 
                ? `$${(value / 1000000).toFixed(2)}M`
                : value >= 1000 
                  ? `$${(value / 1000).toFixed(1)}K`
                  : `$${value.toFixed(2)}`;
            } else if (kpi.format === 'percent') {
              formattedValue = `${value.toFixed(1)}%`;
            } else {
              formattedValue = value >= 1000000 
                ? `${(value / 1000000).toFixed(2)}M`
                : value >= 1000 
                  ? `${(value / 1000).toFixed(1)}K`
                  : value.toLocaleString();
            }
            
            return {
              id: kpi.id,
              title: kpi.title,
              value: formattedValue,
              description: kpi.description
            };
          });
          
          setKpis(generatedKPIs);
          
          // Generate charts
          const generatedCharts = (dashboard.charts || []).map(chart => {
            return {
              id: chart.id || `chart-${Date.now()}-${Math.random()}`,
              chartType: chart.chartType,
              title: chart.title,
              description: chart.description,
              xAxis: chart.xAxis,
              yAxis: chart.yAxis,
              options: generateChartOptions({
                chartType: chart.chartType,
                xAxis: chart.xAxis,
                yAxis: chart.yAxis,
                title: chart.title,
                limit: chart.limit || 10,
                aggregation: chart.aggregation || 'sum',
                calculatedField: chart.calculatedField,
                sortOrder: chart.sortOrder
              }, data, theme)
            };
          });
          
          setCharts(generatedCharts);
          
          // Update suggested questions
          if (dashboard.suggestedQuestions) {
            setSuggestedQuestions(dashboard.suggestedQuestions);
          }
          
          // Add success message
          setChatMessages(prev => [...prev, {
            type: 'system',
            content: `✅ **Dashboard Built Successfully!**\n\n📊 **${dashboard.title}**\n${dashboard.description}\n\n• ${generatedKPIs.length} KPIs generated\n• ${generatedCharts.length} visualizations created\n\n${dashboard.insights?.length > 0 ? '💡 **Key Insights:**\n' + dashboard.insights.map(i => `• ${i.title || i.description || i}`).slice(0, 3).join('\n') : ''}\n\nClick "View Dashboard" to see the complete dashboard, or ask me more questions!`,
            agents: result.agents,
            timestamp: new Date()
          }]);
        }
      } else {
        const error = await response.json();
        setChatMessages(prev => [...prev, {
          type: 'system',
          content: `❌ Failed to build dashboard: ${error.error || 'Unknown error'}`,
          timestamp: new Date()
        }]);
      }
    } catch (error) {
      console.error('Auto-build error:', error);
      setChatMessages(prev => [...prev, {
        type: 'system',
        content: '❌ An error occurred while building the dashboard. Please try again.',
        timestamp: new Date()
      }]);
    }
    
    setIsLoading(false);
    setIsAutoBuildRunning(false);
    setAgentActivity([]);
  };

  // Generate sparkline data for KPI cards
  const generateSparklineData = (kpi, allData, points = 12) => {
    if (!allData || allData.length === 0) return [];
    
    const col = kpi.column;
    const chunkSize = Math.ceil(allData.length / points);
    const sparkData = [];
    
    for (let i = 0; i < points; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, allData.length);
      const chunk = allData.slice(start, end);
      
      if (chunk.length === 0) continue;
      
      let value;
      if (kpi.aggregation === 'countDistinct') {
        value = new Set(chunk.map(row => row[col])).size;
      } else if (kpi.aggregation === 'count') {
        value = chunk.length;
      } else {
        const nums = chunk.map(row => parseFloat(row[col])).filter(v => !isNaN(v));
        if (kpi.aggregation === 'avg') {
          value = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
        } else {
          value = nums.reduce((a, b) => a + b, 0);
        }
      }
      sparkData.push(value);
    }
    
    return sparkData;
  };

  // Render upload view
  if (view === 'upload') {
    return (
      <div style={{
        minHeight: '100vh',
        background: theme.background,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '"DM Sans", system-ui, sans-serif',
        padding: '20px'
      }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@700&display=swap');
          * { box-sizing: border-box; }
        `}</style>
        
        <div style={{
          background: theme.cardBg,
          border: `1px solid ${theme.cardBorder}`,
          borderRadius: '24px',
          padding: '48px',
          maxWidth: '600px',
          width: '100%',
          textAlign: 'center'
        }}>
          <h1 style={{
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: '36px',
            background: `linear-gradient(135deg, ${theme.accent} 0%, ${theme.colors[2]} 100%)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '8px'
          }}>
            AI Dashboard Agent
          </h1>
          <p style={{ color: theme.subtext, marginBottom: '32px' }}>
            Upload your data and let AI build interactive dashboards
          </p>

          {/* Server status */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            background: serverStatus === 'ready' ? 'rgba(74, 222, 128, 0.1)' : 'rgba(251, 191, 36, 0.1)',
            border: `1px solid ${serverStatus === 'ready' ? 'rgba(74, 222, 128, 0.3)' : 'rgba(251, 191, 36, 0.3)'}`,
            borderRadius: '20px',
            marginBottom: '32px',
            fontSize: '13px',
            color: serverStatus === 'ready' ? '#4ade80' : '#fbbf24'
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: serverStatus === 'ready' ? '#4ade80' : '#fbbf24'
            }} />
            {serverStatus === 'ready' ? 'AI Ready' : serverStatus === 'no-key' ? 'API Key Missing' : 'Checking...'}
          </div>

          {/* Upload area */}
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${theme.cardBorder}`,
              borderRadius: '16px',
              padding: '48px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              marginBottom: '24px'
            }}
            onMouseOver={(e) => e.currentTarget.style.borderColor = theme.accent}
            onMouseOut={(e) => e.currentTarget.style.borderColor = theme.cardBorder}
          >
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📁</div>
            <p style={{ color: theme.text, fontSize: '16px', marginBottom: '8px' }}>
              Drop your file here or click to browse
            </p>
            <p style={{ color: theme.subtext, fontSize: '13px' }}>
              Supports CSV, Excel (.xlsx, .xls), JSON
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.json"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
          </div>

          {isLoading && (
            <div style={{ color: theme.accent }}>Processing file...</div>
          )}

          {/* Theme selector */}
          <div style={{ marginTop: '32px' }}>
            <p style={{ color: theme.subtext, fontSize: '13px', marginBottom: '12px' }}>
              Choose Theme
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              {Object.entries(themes).map(([key, t]) => (
                <button
                  key={key}
                  onClick={() => setCurrentTheme(key)}
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    border: currentTheme === key ? `2px solid ${t.accent}` : '2px solid transparent',
                    background: t.background,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  title={t.name}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render conversational explore view
  if (view === 'explore') {
    return (
      <div style={{
        minHeight: '100vh',
        background: theme.background,
        fontFamily: '"DM Sans", system-ui, sans-serif',
        display: 'flex'
      }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@700&family=JetBrains+Mono&display=swap');
          * { box-sizing: border-box; }
          ::-webkit-scrollbar { width: 8px; height: 8px; }
          ::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
          ::-webkit-scrollbar-thumb { background: ${theme.accent}40; border-radius: 4px; }
          input:focus, textarea:focus { outline: none; }
        `}</style>

        {/* Left Panel - Chat & Questions */}
        <div style={{
          width: '400px',
          borderRight: `1px solid ${theme.cardBorder}`,
          display: 'flex',
          flexDirection: 'column',
          height: '100vh'
        }}>
          {/* Header */}
          <div style={{
            padding: '20px',
            borderBottom: `1px solid ${theme.cardBorder}`,
            background: theme.cardBg
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '24px' }}>🤖</span>
                <h2 style={{ margin: 0, color: theme.text, fontSize: '18px' }}>Ask Your Data</h2>
              </div>
              {charts.length > 0 && (
                <button
                  onClick={() => setView('dashboard')}
                  style={{
                    padding: '8px 14px',
                    background: `linear-gradient(135deg, ${theme.accent}, ${theme.colors[2]})`,
                    border: 'none',
                    borderRadius: '8px',
                    color: '#000',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  📊 Dashboard ({charts.length})
                </button>
              )}
            </div>
            <p style={{ margin: 0, color: theme.subtext, fontSize: '13px' }}>
              {fileName} • {data?.length.toLocaleString()} rows
            </p>
          </div>

          {/* Auto Build Dashboard Button */}
          <div style={{
            padding: '16px',
            borderBottom: `1px solid ${theme.cardBorder}`,
            background: `linear-gradient(135deg, ${theme.accent}15 0%, ${theme.colors[2]}15 100%)`
          }}>
            <button
              onClick={handleAutoBuildDashboard}
              disabled={isAutoBuildRunning || isLoading}
              style={{
                width: '100%',
                padding: '14px 20px',
                background: `linear-gradient(135deg, ${theme.accent}, ${theme.colors[2]})`,
                border: 'none',
                borderRadius: '10px',
                color: '#000',
                fontSize: '14px',
                fontWeight: 700,
                cursor: isAutoBuildRunning ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                opacity: isAutoBuildRunning ? 0.7 : 1,
                transition: 'all 0.2s',
                boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
              }}
              onMouseOver={(e) => {
                if (!isAutoBuildRunning) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)';
                }
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
              }}
            >
              {isAutoBuildRunning ? (
                <>
                  <span style={{ animation: 'spin 1s linear infinite' }}>⚙️</span>
                  Building Dashboard...
                </>
              ) : (
                <>
                  🏗️ Auto-Build Dashboard (Like Power BI)
                </>
              )}
            </button>
            <p style={{ 
              margin: '10px 0 0', 
              color: theme.subtext, 
              fontSize: '11px', 
              textAlign: 'center' 
            }}>
              Multi-agent AI creates KPIs, charts & insights automatically
            </p>
            <style>{`
              @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>

          {/* Suggested Questions */}
          <div style={{
            padding: '16px',
            borderBottom: `1px solid ${theme.cardBorder}`,
            background: `${theme.accent}08`
          }}>
            <p style={{ margin: '0 0 12px', color: theme.subtext, fontSize: '12px', fontWeight: 600 }}>
              💡 ASK QUESTIONS OR TRY THESE
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {suggestedQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setQuery(q);
                    handleAskQuestion(q);
                  }}
                  style={{
                    padding: '10px 12px',
                    background: theme.cardBg,
                    border: `1px solid ${theme.cardBorder}`,
                    borderRadius: '8px',
                    color: theme.text,
                    fontSize: '13px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.borderColor = theme.accent;
                    e.currentTarget.style.background = `${theme.accent}15`;
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.borderColor = theme.cardBorder;
                    e.currentTarget.style.background = theme.cardBg;
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Chat Messages */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            {chatMessages.map((msg, i) => (
              <div key={i} style={{
                padding: '12px 16px',
                borderRadius: '12px',
                background: msg.type === 'user' ? `${theme.accent}20` : theme.cardBg,
                border: `1px solid ${msg.type === 'user' ? theme.accent + '40' : theme.cardBorder}`,
                alignSelf: msg.type === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '90%'
              }}>
                {msg.type === 'system' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span>🤖</span>
                    <span style={{ color: theme.accent, fontSize: '12px', fontWeight: 600 }}>AI Assistant</span>
                  </div>
                )}
                <p style={{ 
                  margin: 0, 
                  color: theme.text, 
                  fontSize: '14px',
                  whiteSpace: 'pre-wrap'
                }}>
                  {msg.content}
                </p>
                {msg.sql && (
                  <div style={{
                    marginTop: '12px',
                    padding: '10px',
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: '6px',
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: '11px',
                    color: theme.subtext,
                    overflowX: 'auto'
                  }}>
                    <div style={{ color: theme.accent, marginBottom: '4px', fontSize: '10px' }}>SQL Query:</div>
                    {msg.sql}
                  </div>
                )}
                {msg.agents && msg.agents.length > 0 && (
                  <div style={{
                    marginTop: '12px',
                    padding: '8px 12px',
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: '6px',
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'center',
                    flexWrap: 'wrap'
                  }}>
                    <span style={{ color: theme.subtext, fontSize: '10px' }}>Agents:</span>
                    {msg.agents.map((agent, i) => (
                      <span key={i} style={{
                        padding: '2px 8px',
                        background: `${theme.accent}30`,
                        borderRadius: '10px',
                        fontSize: '10px',
                        color: theme.accent
                      }}>
                        {agent.name} ✓
                      </span>
                    ))}
                  </div>
                )}
                {msg.chartId && (
                  <button
                    onClick={() => setView('dashboard')}
                    style={{
                      marginTop: '12px',
                      padding: '8px 16px',
                      background: `linear-gradient(135deg, ${theme.accent}, ${theme.colors[2]})`,
                      border: 'none',
                      borderRadius: '6px',
                      color: '#000',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    📊 View in Dashboard →
                  </button>
                )}
              </div>
            ))}
            {isLoading && (
              <div style={{
                padding: '16px',
                background: `${theme.accent}10`,
                borderRadius: '12px',
                margin: '8px'
              }}>
                <div style={{ color: theme.text, fontSize: '13px', marginBottom: '12px', fontWeight: 600 }}>
                  🤖 Multi-Agent System Working...
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {agentActivity.map((agent, i) => (
                    <div key={i} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 12px',
                      background: theme.cardBg,
                      borderRadius: '8px',
                      border: `1px solid ${theme.cardBorder}`
                    }}>
                      <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: agent.status === 'complete' ? '#4ade80' : 
                                   agent.status === 'running' ? theme.accent : 
                                   theme.subtext,
                        animation: agent.status === 'running' ? 'pulse 1s infinite' : 'none'
                      }} />
                      <span style={{ 
                        color: agent.status === 'complete' ? '#4ade80' : 
                               agent.status === 'running' ? theme.accent : 
                               theme.subtext,
                        fontSize: '12px',
                        fontWeight: 500
                      }}>
                        {agent.name}
                      </span>
                      <span style={{ color: theme.subtext, fontSize: '11px', marginLeft: 'auto' }}>
                        {agent.status === 'complete' ? '✓' : 
                         agent.status === 'running' ? '...' : 
                         '○'}
                      </span>
                    </div>
                  ))}
                </div>
                <style>{`
                  @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.4; }
                  }
                `}</style>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div style={{
            padding: '16px',
            borderTop: `1px solid ${theme.cardBorder}`,
            background: theme.cardBg
          }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleAskQuestion(query)}
                placeholder="Ask a question about your data..."
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  background: theme.background,
                  border: `1px solid ${theme.cardBorder}`,
                  borderRadius: '10px',
                  color: theme.text,
                  fontSize: '14px'
                }}
              />
              <button
                onClick={() => handleAskQuestion(query)}
                disabled={isLoading || !query.trim()}
                style={{
                  padding: '12px 20px',
                  background: `linear-gradient(135deg, ${theme.accent}, ${theme.colors[2]})`,
                  border: 'none',
                  borderRadius: '10px',
                  color: '#000',
                  fontWeight: 600,
                  cursor: isLoading || !query.trim() ? 'not-allowed' : 'pointer',
                  opacity: isLoading || !query.trim() ? 0.6 : 1
                }}
              >
                Ask
              </button>
            </div>
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setView('dashboard')}
                disabled={charts.length === 0}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: charts.length > 0 ? `${theme.accent}20` : 'transparent',
                  border: `1px solid ${theme.cardBorder}`,
                  borderRadius: '8px',
                  color: charts.length > 0 ? theme.accent : theme.subtext,
                  fontSize: '13px',
                  cursor: charts.length > 0 ? 'pointer' : 'not-allowed'
                }}
              >
                📊 View Dashboard ({charts.length})
              </button>
              <button
                onClick={resetDashboard}
                style={{
                  padding: '10px 16px',
                  background: 'transparent',
                  border: `1px solid ${theme.cardBorder}`,
                  borderRadius: '8px',
                  color: theme.subtext,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                New Data
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel - Data Preview & Charts */}
        <div style={{
          flex: 1,
          padding: '24px',
          overflowY: 'auto',
          height: '100vh'
        }}>
          {/* Column Info */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ color: theme.text, marginBottom: '12px', fontSize: '14px' }}>
              📋 Your Data Columns
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {columnStats.map((col, i) => (
                <div key={i} style={{
                  padding: '8px 12px',
                  background: theme.cardBg,
                  border: `1px solid ${theme.cardBorder}`,
                  borderRadius: '8px',
                  fontSize: '12px'
                }}>
                  <span style={{ color: theme.accent, fontWeight: 600 }}>{col.name}</span>
                  <span style={{ color: theme.subtext, marginLeft: '8px' }}>
                    {col.isNumeric ? '🔢' : col.isDate ? '📅' : '📝'} 
                    {col.uniqueCount} unique
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Generated Charts Preview */}
          {charts.length > 0 ? (
            <div>
              <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '14px' }}>
                📊 Generated Visualizations ({charts.length})
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '16px' }}>
                {charts.map((chart) => (
                  <div key={chart.id} style={{
                    background: theme.cardBg,
                    border: `1px solid ${theme.cardBorder}`,
                    borderRadius: '12px',
                    padding: '16px',
                    position: 'relative'
                  }}>
                    <button
                      onClick={() => downloadChartAsPNG(chart.id)}
                      style={{
                        position: 'absolute',
                        top: '12px',
                        right: '48px',
                        height: '28px',
                        padding: '0 10px',
                        borderRadius: '6px',
                        border: `1px solid ${theme.cardBorder}`,
                        background: theme.cardBg,
                        color: theme.text,
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                      title="Save this chart as a PNG"
                    >
                      Save PNG
                    </button>
                    {/* Delete button */}
                    <button
                      onClick={() => deleteChart(chart.id)}
                      style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        width: '28px',
                        height: '28px',
                        borderRadius: '6px',
                        border: `1px solid ${theme.cardBorder}`,
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: '#ef4444',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        transition: 'all 0.2s'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.3)';
                        e.currentTarget.style.borderColor = '#ef4444';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                        e.currentTarget.style.borderColor = theme.cardBorder;
                      }}
                      title="Delete visualization"
                    >
                      ✕
                    </button>
                    <h4 style={{ margin: '0 0 8px', color: theme.text, fontSize: '14px', paddingRight: '40px' }}>{chart.title}</h4>
                    {chart.description && (
                      <p style={{ margin: '0 0 12px', color: theme.subtext, fontSize: '12px' }}>{chart.description}</p>
                    )}
                    {chart.options && (
                      <ReactECharts
                        option={{...chart.options, title: { ...chart.options.title, show: false }}}
                        style={{ height: '250px', width: '100%' }}
                        opts={{ renderer: 'canvas' }}
                        onChartReady={(instance) => { chartRefs.current[chart.id] = instance; }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{
              textAlign: 'center',
              padding: '60px',
              color: theme.subtext,
              background: theme.cardBg,
              borderRadius: '16px',
              border: `1px dashed ${theme.cardBorder}`
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>💬</div>
              <p style={{ margin: 0, fontSize: '16px' }}>Ask questions on the left to create visualizations</p>
              <p style={{ margin: '8px 0 0', fontSize: '13px', opacity: 0.7 }}>
                Try clicking one of the suggested questions!
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render analyze view (legacy - keeping for auto-analysis option)
  if (view === 'analyze') {
    return (
      <div style={{
        minHeight: '100vh',
        background: theme.background,
        fontFamily: '"DM Sans", system-ui, sans-serif',
        padding: '24px'
      }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@700&family=JetBrains+Mono&display=swap');
          * { box-sizing: border-box; }
          ::-webkit-scrollbar { width: 8px; height: 8px; }
          ::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
          ::-webkit-scrollbar-thumb { background: ${theme.accent}40; border-radius: 4px; }
        `}</style>

        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '24px'
          }}>
            <div>
              <h1 style={{ color: theme.text, fontSize: '24px', margin: 0 }}>
                Data Preview
              </h1>
              <p style={{ color: theme.subtext, margin: '4px 0 0' }}>
                {fileName} • {data?.length.toLocaleString()} rows • {columns.length} columns
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={resetDashboard}
                style={{
                  padding: '12px 24px',
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '10px',
                  color: theme.text,
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Cancel
              </button>
              <button
                onClick={analyzeData}
                disabled={isLoading || serverStatus !== 'ready'}
                style={{
                  padding: '12px 32px',
                  background: `linear-gradient(135deg, ${theme.accent} 0%, ${theme.colors[2]} 100%)`,
                  border: 'none',
                  borderRadius: '10px',
                  color: '#0f172a',
                  fontWeight: 600,
                  cursor: isLoading || serverStatus !== 'ready' ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  opacity: isLoading || serverStatus !== 'ready' ? 0.6 : 1
                }}
              >
                {isLoading ? 'Analyzing...' : '🚀 Build Dashboard with AI'}
              </button>
            </div>
          </div>

          {/* Columns info */}
          <div style={{
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap',
            marginBottom: '24px'
          }}>
            {columns.map((col, i) => (
              <div key={col} style={{
                padding: '8px 16px',
                background: theme.cardBg,
                border: `1px solid ${theme.cardBorder}`,
                borderRadius: '8px',
                fontSize: '13px',
                color: theme.text
              }}>
                <span style={{ color: theme.accent }}>{col}</span>
                <span style={{ color: theme.subtext, marginLeft: '8px' }}>
                  {typeof data[0]?.[col]}
                </span>
              </div>
            ))}
          </div>

          {/* Data table preview */}
          <div style={{
            background: theme.cardBg,
            border: `1px solid ${theme.cardBorder}`,
            borderRadius: '16px',
            overflow: 'hidden'
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: '13px'
              }}>
                <thead>
                  <tr>
                    {columns.map(col => (
                      <th key={col} style={{
                        padding: '16px',
                        textAlign: 'left',
                        color: theme.accent,
                        borderBottom: `1px solid ${theme.cardBorder}`,
                        whiteSpace: 'nowrap'
                      }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data?.slice(0, 20).map((row, i) => (
                    <tr key={i} style={{
                      background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'
                    }}>
                      {columns.map(col => (
                        <td key={col} style={{
                          padding: '12px 16px',
                          color: theme.text,
                          borderBottom: `1px solid ${theme.cardBorder}`,
                          whiteSpace: 'nowrap'
                        }}>
                          {String(row[col] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data?.length > 20 && (
              <div style={{
                padding: '16px',
                textAlign: 'center',
                color: theme.subtext,
                fontSize: '13px'
              }}>
                Showing 20 of {data.length.toLocaleString()} rows
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Render dashboard view
  return (
    <div style={{
      minHeight: '100vh',
      background: theme.background,
      fontFamily: '"DM Sans", system-ui, sans-serif',
      padding: '24px'
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@700&family=JetBrains+Mono&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
        ::-webkit-scrollbar-thumb { background: ${theme.accent}40; border-radius: 4px; }
        input:focus { outline: none; }
      `}</style>

      <div style={{ maxWidth: '1800px', margin: '0 auto' }}>
        {/* Professional Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '28px',
          paddingBottom: '20px',
          borderBottom: `1px solid ${theme.cardBorder}`
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              {/* Back Button */}
              <button
                onClick={() => setView('explore')}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: theme.cardBg,
                  border: `1px solid ${theme.cardBorder}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = theme.accent;
                  e.currentTarget.style.borderColor = theme.accent;
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = theme.cardBg;
                  e.currentTarget.style.borderColor = theme.cardBorder;
                }}
                title="Back to Explore"
              >
                ←
              </button>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: `linear-gradient(135deg, ${theme.accent} 0%, ${theme.colors[2]} 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px'
              }}>
                📊
              </div>
              <h1 style={{
                fontFamily: '"Space Grotesk", sans-serif',
                fontSize: '26px',
                color: theme.text,
                margin: 0,
                fontWeight: 700
              }}>
                {analysis?.summary || 'Dashboard'}
              </h1>
            </div>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <span style={{ 
                color: theme.subtext, 
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span style={{ opacity: 0.6 }}>📁</span> {fileName}
              </span>
              <span style={{ 
                color: theme.subtext, 
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span style={{ opacity: 0.6 }}>📋</span> {data?.length.toLocaleString()} records
              </span>
              <span style={{ 
                color: theme.subtext, 
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span style={{ opacity: 0.6 }}>📈</span> {charts.length} visualizations
              </span>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            {/* Theme selector with label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ color: theme.subtext, fontSize: '12px' }}>Theme</span>
              <div style={{ 
                display: 'flex', 
                gap: '4px',
                padding: '4px',
                background: 'rgba(0,0,0,0.2)',
                borderRadius: '10px'
              }}>
                {Object.entries(themes).map(([key, t]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setCurrentTheme(key);
                      // Regenerate charts with new theme
                      if (analysis?.recommendations) {
                        const regeneratedCharts = analysis.recommendations.map((rec, index) => ({
                          id: `chart-${index}`,
                          ...rec,
                          options: generateChartOptions(rec, data, t)
                        }));
                        setCharts(regeneratedCharts);
                      }
                    }}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '6px',
                      border: currentTheme === key ? `2px solid ${t.accent}` : '2px solid transparent',
                      background: t.background,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    title={t.name}
                  />
                ))}
              </div>
            </div>
            
            <button
              onClick={resetDashboard}
              style={{
                padding: '10px 20px',
                background: `${theme.accent}20`,
                border: `1px solid ${theme.accent}40`,
                borderRadius: '10px',
                color: theme.accent,
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = `${theme.accent}30`;
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = `${theme.accent}20`;
              }}
            >
              <span>+</span> New Data
            </button>
          </div>
        </div>

        {/* Query input */}
        <div style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '24px'
        }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
            placeholder="Ask a question about your data... (e.g., 'Show me sales by region')"
            style={{
              flex: 1,
              padding: '14px 20px',
              background: theme.cardBg,
              border: `1px solid ${theme.cardBorder}`,
              borderRadius: '12px',
              color: theme.text,
              fontSize: '14px'
            }}
          />
          <button
            onClick={handleQuery}
            disabled={isLoading || !query.trim()}
            style={{
              padding: '14px 28px',
              background: `linear-gradient(135deg, ${theme.accent} 0%, ${theme.colors[2]} 100%)`,
              border: 'none',
              borderRadius: '12px',
              color: '#0f172a',
              fontWeight: 600,
              cursor: isLoading || !query.trim() ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              opacity: isLoading || !query.trim() ? 0.6 : 1
            }}
          >
            {isLoading ? 'Processing...' : 'Ask AI'}
          </button>
        </div>

        {/* KPIs */}
        {kpis.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(kpis.length, 5)}, 1fr)`,
            gap: '16px',
            marginBottom: '24px'
          }}>
            {kpis.map((kpi, i) => {
              // Generate mini sparkline data for each KPI
              const sparklineData = generateSparklineData(kpi, data, 12);
              const icons = ['📊', '💰', '📈', '👥', '🎯', '⚡', '📦', '🔄'];
              
              return (
                <div key={i} style={{
                  background: theme.cardBg,
                  border: `1px solid ${theme.cardBorder}`,
                  borderRadius: '16px',
                  padding: '20px',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  {/* Background decoration */}
                  <div style={{
                    position: 'absolute',
                    top: '-20px',
                    right: '-20px',
                    width: '80px',
                    height: '80px',
                    background: `radial-gradient(circle, ${theme.accent}20 0%, transparent 70%)`,
                    borderRadius: '50%'
                  }} />
                  
                  <div style={{ position: 'relative' }}>
                    {/* Icon and label row */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '12px'
                    }}>
                      <span style={{ fontSize: '18px' }}>{icons[i % icons.length]}</span>
                      <span style={{
                        fontSize: '12px',
                        color: theme.subtext,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        fontWeight: 500
                      }}>
                        {kpi.label}
                      </span>
                    </div>
                    
                    {/* Value */}
                    <div style={{
                      fontSize: '32px',
                      fontWeight: 700,
                      color: theme.text,
                      marginBottom: '8px',
                      fontFamily: '"Space Grotesk", sans-serif'
                    }}>
                      {kpi.value}
                    </div>
                    
                    {/* Mini sparkline */}
                    {sparklineData.length > 0 && (
                      <svg width="100%" height="30" style={{ display: 'block' }}>
                        <defs>
                          <linearGradient id={`sparkGrad${i}`} x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor={theme.accent} stopOpacity="0.4" />
                            <stop offset="100%" stopColor={theme.accent} stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        {(() => {
                          const max = Math.max(...sparklineData, 1);
                          const min = Math.min(...sparklineData, 0);
                          const range = max - min || 1;
                          const points = sparklineData.map((v, idx) => {
                            const x = (idx / (sparklineData.length - 1)) * 100;
                            const y = 28 - ((v - min) / range) * 24;
                            return `${x},${y}`;
                          }).join(' ');
                          const areaPoints = `0,28 ${points} 100,28`;
                          return (
                            <>
                              <polygon points={areaPoints} fill={`url(#sparkGrad${i})`} />
                              <polyline
                                points={points}
                                fill="none"
                                stroke={theme.accent}
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </>
                          );
                        })()}
                      </svg>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Charts grid - responsive layout */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(12, 1fr)',
          gap: '20px'
        }}>
          {charts.map((chart, index) => {
            // Determine chart size based on type for better layout
            let colSpan = 6; // Default half width
            if (chart.chartType === 'area' || chart.chartType === 'line') {
              colSpan = 8; // Wider for time series
            } else if (chart.chartType === 'gauge') {
              colSpan = 4; // Narrower for gauges
            } else if (chart.chartType === 'donut' || chart.chartType === 'pie') {
              colSpan = 4; // Compact for pie charts
            } else if (chart.chartType === 'horizontalBar') {
              colSpan = 6; // Medium for horizontal bars
            }
            
            // Make first chart full width if it's a trend chart
            if (index === 0 && (chart.chartType === 'area' || chart.chartType === 'line')) {
              colSpan = 12;
            }
            
            const chartHeight = chart.chartType === 'gauge' ? '250px' : 
                               chart.chartType === 'horizontalBar' ? '320px' : '300px';
            
            return (
              <div key={chart.id} style={{
                gridColumn: `span ${colSpan}`,
                background: theme.cardBg,
                border: `1px solid ${theme.cardBorder}`,
                borderRadius: '16px',
                padding: '20px',
                minHeight: chartHeight,
                boxShadow: `0 4px 20px ${theme.accent}10`,
                transition: 'transform 0.2s, box-shadow 0.2s'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = `0 8px 30px ${theme.accent}20`;
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = `0 4px 20px ${theme.accent}10`;
              }}
              >
                {/* Chart header */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '8px'
                }}>
                  <div style={{ flex: 1, paddingRight: '8px' }}>
                    <h3 style={{
                      margin: 0,
                      fontSize: '14px',
                      fontWeight: 600,
                      color: theme.text
                    }}>
                      {chart.title}
                    </h3>
                    {chart.description && (
                      <p style={{
                        margin: '4px 0 0',
                        fontSize: '11px',
                        color: theme.subtext
                      }}>
                        {chart.description}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      padding: '4px 8px',
                      background: `${theme.accent}20`,
                      borderRadius: '6px',
                      fontSize: '10px',
                      color: theme.accent,
                      textTransform: 'uppercase',
                      fontWeight: 600
                    }}>
                      {chart.chartType}
                    </span>
                    <button
                      onClick={() => downloadChartAsPNG(chart.id)}
                      style={{
                        height: '24px',
                        padding: '0 8px',
                        borderRadius: '6px',
                        border: `1px solid ${theme.cardBorder}`,
                        background: theme.cardBg,
                        color: theme.text,
                        cursor: 'pointer',
                        fontSize: '11px'
                      }}
                      title="Save this chart as a PNG"
                    >
                      Save PNG
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteChart(chart.id);
                      }}
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '6px',
                        border: `1px solid ${theme.cardBorder}`,
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: '#ef4444',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        transition: 'all 0.2s'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.3)';
                        e.currentTarget.style.borderColor = '#ef4444';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                        e.currentTarget.style.borderColor = theme.cardBorder;
                      }}
                      title="Delete visualization"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                
                {chart.options && (
                  <ReactECharts
                    option={{...chart.options, title: { ...chart.options.title, show: false }}}
                    style={{ height: `calc(${chartHeight} - 60px)`, width: '100%' }}
                    opts={{ renderer: 'canvas' }}
                        onChartReady={(instance) => { chartRefs.current[chart.id] = instance; }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {charts.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '80px',
            color: theme.subtext,
            background: theme.cardBg,
            borderRadius: '16px',
            border: `1px dashed ${theme.cardBorder}`
          }}>
            <div style={{ fontSize: '64px', marginBottom: '16px', opacity: 0.3 }}>📊</div>
            <p style={{ fontSize: '16px', margin: 0 }}>No charts generated yet</p>
            <p style={{ fontSize: '13px', marginTop: '8px', opacity: 0.7 }}>Ask a question above to create visualizations</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
