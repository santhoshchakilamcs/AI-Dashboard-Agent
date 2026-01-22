/**
 * Multi-Agent AI System for Dashboard Generation
 * Like Power BI / Tableau - AI builds dashboards automatically
 * 
 * Agents:
 * 1. Data Analyst Agent - Deep understanding of data structure and patterns
 * 2. Dashboard Architect Agent - Plans the complete dashboard layout
 * 3. SQL Expert Agent - Generates optimized SQL queries
 * 4. Visualization Expert Agent - Designs individual visualizations
 * 5. Insight Generator Agent - Finds key insights and KPIs
 * 6. Orchestrator - Coordinates all agents
 */

// Helper to call OpenAI - reads API key at runtime (after dotenv loads)
async function callLLM(systemPrompt, userMessage, options = {}) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: options.model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      max_tokens: options.maxTokens || 2000,
      temperature: options.temperature || 0.3
    })
  });

  if (!response.ok) {
    throw new Error(`LLM call failed: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// Parse JSON from LLM response (handles markdown code blocks)
function parseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[1] || match[0]);
    }
    throw new Error('Could not parse JSON from response');
  }
}

/**
 * DATA ANALYST AGENT
 * Like a senior data analyst first examining the dataset
 */
async function dataAnalystAgent(columns, sampleData, rowCount) {
  console.log('🔍 [Data Analyst Agent] Deep-diving into data structure...');
  
  const systemPrompt = `You are a Senior Data Analyst Agent, like one working in Power BI or Tableau.
Your job is to deeply understand datasets before any dashboard is built.

Think like a human analyst:
1. What business domain is this data from?
2. What are the KEY QUESTIONS a business user would ask?
3. What relationships and patterns exist?
4. What calculated metrics would be valuable?

Analyze comprehensively and identify:

DIMENSIONS (categorical columns for grouping/filtering):
- Low cardinality = good for filters and legends
- High cardinality = good for detailed drill-down
- Geographic = can be used for maps

MEASURES (numeric columns for calculations):
- Identify which aggregations make sense (sum, avg, count, etc.)
- Spot potential calculated fields

DATE/TIME columns:
- Identify date hierarchies (Year > Quarter > Month > Day)
- Determine best granularity for trends

IMPORTANT: Look for multiplicative relationships like:
- Price × Quantity = Revenue/Sales
- Hours × Rate = Cost
- Units × Price = Total

Return JSON:
{
  "dataType": "sales|ecommerce|hr|support|inventory|financial|marketing|logistics|other",
  "businessContext": "Detailed description of what this data represents and its business purpose",
  "keyQuestions": [
    "Question a business user would ask 1",
    "Question a business user would ask 2",
    "Question a business user would ask 3"
  ],
  "dimensions": [
    {"name": "exact_column_name", "description": "what it represents", "cardinality": "low|medium|high", "isGeographic": false, "suggestedUse": "filter|legend|axis|drill-down"}
  ],
  "measures": [
    {"name": "exact_column_name", "description": "what it represents", "aggregations": ["sum", "avg"], "format": "number|currency|percent"}
  ],
  "dateColumns": [
    {"name": "exact_column_name", "granularity": "daily|monthly|yearly", "hierarchy": ["Year", "Month", "Day"]}
  ],
  "calculatedFields": [
    {"name": "Revenue", "formula": "UnitPrice * Quantity", "description": "Total revenue per transaction", "columns": ["UnitPrice", "Quantity"]}
  ],
  "relationships": [
    {"type": "hierarchy|one-to-many|many-to-many", "columns": ["Parent", "Child"], "description": "..."}
  ],
  "keyInsights": [
    "Key insight about the data 1",
    "Key insight about the data 2"
  ],
  "recommendedKPIs": [
    {"name": "Total Revenue", "formula": "SUM(UnitPrice * Quantity)", "format": "currency"},
    {"name": "Unique Customers", "formula": "COUNT(DISTINCT CustomerID)", "format": "number"}
  ]
}`;

  const userMessage = `Analyze this dataset like a senior data analyst would before building a dashboard:

COLUMNS WITH STATS:
${JSON.stringify(columns, null, 2)}

SAMPLE DATA (${rowCount.toLocaleString()} total rows):
${JSON.stringify(sampleData, null, 2)}

Provide comprehensive analysis. Use EXACT column names from the data.`;

  const response = await callLLM(systemPrompt, userMessage, { maxTokens: 2500 });
  const result = parseJSON(response);
  
  console.log(`   ✓ Identified: ${result.dimensions?.length || 0} dimensions, ${result.measures?.length || 0} measures`);
  console.log(`   ✓ Business Context: ${result.businessContext?.substring(0, 60)}...`);
  
  return result;
}

/**
 * DASHBOARD ARCHITECT AGENT
 * Plans the complete dashboard like a Power BI expert
 */
async function dashboardArchitectAgent(dataAnalysis, columns, sampleData) {
  console.log('📐 [Dashboard Architect Agent] Planning dashboard layout...');
  
  const systemPrompt = `You are a Dashboard Architect Agent, like a Power BI or Tableau expert.
Your job is to PLAN a complete, insightful dashboard.

DATA CONTEXT:
- Type: ${dataAnalysis.dataType}
- Business: ${dataAnalysis.businessContext}
- Dimensions: ${dataAnalysis.dimensions?.map(d => d.name).join(', ')}
- Measures: ${dataAnalysis.measures?.map(m => m.name).join(', ')}
- Calculated Fields: ${JSON.stringify(dataAnalysis.calculatedFields || [])}
- Date Columns: ${dataAnalysis.dateColumns?.map(d => d.name).join(', ')}

KEY QUESTIONS TO ANSWER:
${dataAnalysis.keyQuestions?.map((q, i) => `${i + 1}. ${q}`).join('\n')}

DASHBOARD DESIGN PRINCIPLES (like Power BI best practices):
1. TOP ROW: 5-8 KPI cards showing key metrics (totals, averages, counts)
2. MAIN CHARTS: 3-4 primary visualizations answering key questions
3. SUPPORTING CHARTS: 3-4 detailed views or breakdowns
4. TRENDS: At least 1-2 time-series charts if date columns exist
5. RANKINGS: Top/Bottom performers (departments, categories, etc.)
6. DISTRIBUTIONS: Show how key metrics are distributed
7. COMPARISONS: Compare across categories (departments, types, etc.)
8. CORRELATIONS: Show relationships between numeric variables

CREATE CHARTS FOR THESE PATTERNS:
- For each categorical column with <20 unique values: Create a breakdown chart
- For each numeric column: Consider avg/sum by a dimension
- For date columns: Create trend analysis
- For rating/score columns: Show distribution and averages by category
- Look for interesting cross-tabulations between dimensions

CHART TYPE SELECTION RULES:
- horizontalBar: Rankings, top N (5-15 items)
- bar: Category comparisons (≤10 categories)
- donut: Composition/distribution (2-6 categories ONLY)
- line: Trends over time
- area: Volume trends over time
- gauge: Single percentage KPI
- stackedBar: Composition across categories

Return JSON with EXACTLY this structure:
{
  "dashboardTitle": "Dashboard title",
  "dashboardDescription": "What this dashboard shows",
  "kpis": [
    {
      "id": "kpi-1",
      "title": "KPI Title",
      "measure": "exact_column_name",
      "aggregation": "sum|avg|count|countDistinct|max|min",
      "calculatedField": "Column1 * Column2 (if needed, else null)",
      "format": "number|currency|percent",
      "description": "What this KPI shows"
    }
  ],
  "charts": [
    {
      "id": "chart-1",
      "priority": 1,
      "chartType": "horizontalBar|bar|donut|line|area|gauge|stackedBar",
      "title": "Chart title",
      "description": "What insight this provides",
      "xAxis": "exact_column_name for grouping",
      "yAxis": "exact_column_name for values",
      "aggregation": "sum|avg|count|countDistinct",
      "calculatedField": "Column1 * Column2 (if multiplying columns, else null)",
      "limit": 10,
      "sortOrder": "desc|asc",
      "questionAnswered": "Which key question this answers"
    }
  ],
  "filters": [
    {"column": "exact_column_name", "type": "dropdown|date-range"}
  ],
  "layout": {
    "kpiRow": true,
    "mainChartCount": 2,
    "supportingChartCount": 2
  }
}

IMPORTANT:
- Use EXACT column names from the data
- For revenue/sales calculations, use calculatedField with EXACT column names
- Include 5-8 KPIs covering different aspects of the data
- Include 6-10 charts to thoroughly explore the data
- Each chart must answer a specific business question
- Cover ALL important dimensions and measures
- Create charts for: distributions, comparisons, trends, rankings, correlations
- Don't leave important columns unused!`;

  const userMessage = `Plan a comprehensive dashboard for this data.

AVAILABLE COLUMNS: ${columns.map(c => c.name).join(', ')}

Design the dashboard now.`;

  const response = await callLLM(systemPrompt, userMessage, { maxTokens: 3000 });
  const result = parseJSON(response);
  
  console.log(`   ✓ Planned: ${result.kpis?.length || 0} KPIs, ${result.charts?.length || 0} charts`);
  
  return result;
}

/**
 * SQL EXPERT AGENT
 * Generates accurate, optimized SQL queries
 */
async function sqlExpertAgent(question, schema, dataAnalysis) {
  console.log('💾 [SQL Expert Agent] Generating SQL query...');
  
  const systemPrompt = `You are a SQL Expert Agent. You write perfect SQLite queries.

SCHEMA:
${schema}

DATA ANALYSIS:
- Data Type: ${dataAnalysis.dataType}
- Dimensions: ${dataAnalysis.dimensions?.map(d => d.name).join(', ')}
- Measures: ${dataAnalysis.measures?.map(m => m.name).join(', ')}
- Calculated Fields: ${JSON.stringify(dataAnalysis.calculatedFields || [])}

RULES:
1. Always quote column names with double quotes: SELECT "Column Name"
2. Use proper aggregations: SUM(), AVG(), COUNT(), COUNT(DISTINCT x)
3. GROUP BY for dimensions, aggregate measures
4. ORDER BY for sorting results
5. LIMIT for top/bottom N queries
6. For calculated fields, do the math in SQL: SELECT "Price" * "Quantity" AS Revenue
7. Use strftime('%Y-%m', "DateCol") for monthly grouping
8. ALWAYS return at least 2 columns for visualization

Return JSON:
{
  "sql": "SELECT ... FROM data ...",
  "explanation": "What this query does",
  "resultColumns": ["col1", "col2"],
  "expectedRowCount": "single|few|many"
}`;

  const userMessage = `User question: "${question}"

Generate the SQL query to answer this question.`;

  const response = await callLLM(systemPrompt, userMessage);
  return parseJSON(response);
}

/**
 * VISUALIZATION EXPERT AGENT
 * Designs individual visualizations
 */
async function vizExpertAgent(question, sqlResult, dataAnalysis) {
  console.log('📊 [Visualization Expert Agent] Designing chart...');
  
  const systemPrompt = `You are a Visualization Expert Agent. You design beautiful, insightful charts.

DATA CONTEXT:
- Data Type: ${dataAnalysis.dataType}
- Business Context: ${dataAnalysis.businessContext}

CHART TYPE GUIDELINES:
1. "horizontalBar" - Best for TOP N comparisons, category rankings (use for 5-15 items)
2. "bar" - Vertical comparisons, when labels are short
3. "donut" - Distribution/composition (ONLY for 2-6 categories)
4. "line" - Time series trends
5. "area" - Time series with emphasis on volume
6. "scatter" - Correlation between two numeric variables
7. "gauge" - Single KPI percentage (0-100)
8. "stackedBar" - Composition across categories

Return JSON:
{
  "chartType": "horizontalBar|bar|donut|line|area|scatter|gauge|stackedBar",
  "title": "Clear, descriptive title",
  "description": "What insight this visualization provides",
  "xAxis": "column for x-axis/categories",
  "yAxis": "column for y-axis/values", 
  "config": {
    "limit": 10,
    "aggregation": "sum|avg|count",
    "sortOrder": "desc|asc",
    "showLabels": true
  },
  "designRationale": "Why this visualization type was chosen"
}`;

  const userMessage = `User asked: "${question}"

SQL Result columns: ${JSON.stringify(sqlResult.resultColumns)}
Expected rows: ${sqlResult.expectedRowCount}

Design the best visualization.`;

  const response = await callLLM(systemPrompt, userMessage);
  return parseJSON(response);
}

/**
 * INSIGHT GENERATOR AGENT
 * Finds key insights and KPIs automatically
 */
async function insightGeneratorAgent(dataAnalysis, sampleData, rowCount) {
  console.log('💡 [Insight Generator Agent] Finding key insights...');
  
  const systemPrompt = `You are an Insight Generator Agent. You find key business insights from data.

DATA CONTEXT:
- Type: ${dataAnalysis.dataType}
- Business: ${dataAnalysis.businessContext}
- Dimensions: ${JSON.stringify(dataAnalysis.dimensions)}
- Measures: ${JSON.stringify(dataAnalysis.measures)}
- Calculated Fields: ${JSON.stringify(dataAnalysis.calculatedFields)}

Based on the data, generate:
1. Summary statistics that would appear at the top of a dashboard
2. Key insights that would be valuable for decision-making
3. Anomalies or interesting patterns

Return JSON:
{
  "summaryStats": [
    {"label": "Total Rows", "value": "${rowCount}", "format": "number"},
    {"label": "Unique X", "value": "COUNT DISTINCT of key column", "format": "number"}
  ],
  "insights": [
    {"type": "trend|comparison|anomaly|correlation", "title": "Insight title", "description": "Detailed insight"}
  ],
  "recommendations": [
    "Recommendation for the user 1",
    "Recommendation for the user 2"
  ]
}`;

  const userMessage = `Analyze the data and generate insights.

SAMPLE DATA:
${JSON.stringify(sampleData.slice(0, 5), null, 2)}

Total rows: ${rowCount}`;

  const response = await callLLM(systemPrompt, userMessage);
  return parseJSON(response);
}

/**
 * ORCHESTRATOR AGENT
 * Coordinates all agents - like a project manager
 */
async function orchestratorAgent(question, columns, sampleData, rowCount, dataAnalysisCache = null) {
  console.log('\n' + '═'.repeat(60));
  console.log('🎯 [Orchestrator] Starting Multi-Agent Pipeline');
  console.log('═'.repeat(60));
  console.log(`   Question: "${question}"`);
  
  const startTime = Date.now();
  const agentResults = {
    agents: [],
    success: false
  };

  try {
    // Step 1: Data Analysis (use cache if available)
    let dataAnalysis = dataAnalysisCache;
    if (!dataAnalysis) {
      console.log('\n📍 Step 1: Data Analyst Agent');
      dataAnalysis = await dataAnalystAgent(columns, sampleData, rowCount);
      agentResults.dataAnalysis = dataAnalysis;
      agentResults.agents.push({ name: 'Data Analyst', status: 'complete' });
    } else {
      console.log('\n📍 Step 1: Using cached data analysis');
      agentResults.dataAnalysis = dataAnalysis;
      agentResults.agents.push({ name: 'Data Analyst', status: 'cached' });
    }

    // Step 2: SQL Generation
    console.log('\n📍 Step 2: SQL Expert Agent');
    const schema = columns.map(c => `"${c.name}" (${c.type})`).join(', ');
    const sqlResult = await sqlExpertAgent(question, schema, dataAnalysis);
    agentResults.sql = sqlResult;
    agentResults.agents.push({ name: 'SQL Expert', status: 'complete' });
    console.log(`   ✓ SQL: ${sqlResult.sql.substring(0, 80)}...`);

    // Step 3: Visualization Design
    console.log('\n📍 Step 3: Visualization Expert Agent');
    const vizResult = await vizExpertAgent(question, sqlResult, dataAnalysis);
    agentResults.visualization = vizResult;
    agentResults.agents.push({ name: 'Viz Expert', status: 'complete' });
    console.log(`   ✓ Chart Type: ${vizResult.chartType}`);

    // Compile final result
    agentResults.success = true;
    agentResults.answer = {
      explanation: sqlResult.explanation,
      sql: sqlResult.sql,
      chartType: vizResult.chartType,
      chartConfig: {
        title: vizResult.title,
        description: vizResult.description,
        xAxis: vizResult.xAxis,
        yAxis: vizResult.yAxis,
        ...vizResult.config
      },
      insights: dataAnalysis.keyInsights,
      designRationale: vizResult.designRationale
    };

    const duration = Date.now() - startTime;
    console.log(`\n✅ [Orchestrator] Complete in ${duration}ms`);
    console.log('═'.repeat(60) + '\n');

    return agentResults;

  } catch (error) {
    console.error('\n❌ [Orchestrator] Pipeline failed:', error.message);
    agentResults.error = error.message;
    return agentResults;
  }
}

/**
 * BUILD DASHBOARD AGENT
 * Main entry point for automatic dashboard generation
 * This is like clicking "Build Dashboard" in Power BI
 */
async function buildDashboardAgent(columns, sampleData, rowCount) {
  console.log('\n' + '═'.repeat(60));
  console.log('🏗️  [Build Dashboard] Starting Automatic Dashboard Generation');
  console.log('    Like Power BI / Tableau auto-dashboard feature');
  console.log('═'.repeat(60));
  
  const startTime = Date.now();
  const result = {
    agents: [],
    success: false
  };

  try {
    // Step 1: Deep Data Analysis
    console.log('\n📍 Phase 1: Data Analyst Agent');
    const dataAnalysis = await dataAnalystAgent(columns, sampleData, rowCount);
    result.dataAnalysis = dataAnalysis;
    result.agents.push({ name: 'Data Analyst', status: 'complete', output: 'Data structure understood' });

    // Step 2: Dashboard Architecture
    console.log('\n📍 Phase 2: Dashboard Architect Agent');
    const dashboardPlan = await dashboardArchitectAgent(dataAnalysis, columns, sampleData);
    result.dashboardPlan = dashboardPlan;
    result.agents.push({ name: 'Dashboard Architect', status: 'complete', output: `${dashboardPlan.kpis?.length} KPIs, ${dashboardPlan.charts?.length} charts planned` });

    // Step 3: Generate Insights
    console.log('\n📍 Phase 3: Insight Generator Agent');
    const insights = await insightGeneratorAgent(dataAnalysis, sampleData, rowCount);
    result.insights = insights;
    result.agents.push({ name: 'Insight Generator', status: 'complete', output: `${insights.insights?.length} insights found` });

    // Compile complete dashboard
    result.success = true;
    result.dashboard = {
      title: dashboardPlan.dashboardTitle,
      description: dashboardPlan.dashboardDescription,
      dataContext: {
        type: dataAnalysis.dataType,
        businessContext: dataAnalysis.businessContext,
        totalRows: rowCount
      },
      kpis: dashboardPlan.kpis,
      charts: dashboardPlan.charts,
      insights: insights.insights,
      recommendations: insights.recommendations,
      calculatedFields: dataAnalysis.calculatedFields,
      suggestedQuestions: dataAnalysis.keyQuestions
    };

    const duration = Date.now() - startTime;
    console.log(`\n✅ [Build Dashboard] Complete in ${duration}ms`);
    console.log(`   📊 Generated: ${result.dashboard.kpis?.length} KPIs, ${result.dashboard.charts?.length} charts`);
    console.log('═'.repeat(60) + '\n');

    return result;

  } catch (error) {
    console.error('\n❌ [Build Dashboard] Failed:', error.message);
    result.error = error.message;
    return result;
  }
}

/**
 * QUICK ANSWER AGENT
 * For simple questions that don't need the full pipeline
 */
async function quickAnswerAgent(question, columns, sampleData) {
  console.log('⚡ [Quick Answer Agent] Processing simple question...');
  
  const systemPrompt = `You are a helpful data assistant. Answer the user's question about their data.

COLUMNS: ${columns.map(c => `${c.name} (${c.type})`).join(', ')}

For visualization questions, return JSON:
{
  "type": "visualization",
  "answer": "Brief answer",
  "sql": "SELECT query",
  "chartType": "bar|line|donut|horizontalBar|area",
  "chartConfig": {
    "title": "Chart title",
    "xAxis": "column",
    "yAxis": "column",
    "aggregation": "sum|avg|count",
    "limit": 10
  }
}

For factual questions, return JSON:
{
  "type": "factual",
  "answer": "Your detailed answer here"
}`;

  const userMessage = `Question: "${question}"

Sample data:
${JSON.stringify(sampleData.slice(0, 3), null, 2)}`;

  const response = await callLLM(systemPrompt, userMessage, { temperature: 0.2 });
  return parseJSON(response);
}

// Export all agents
export {
  dataAnalystAgent,
  dashboardArchitectAgent,
  sqlExpertAgent,
  vizExpertAgent,
  insightGeneratorAgent,
  orchestratorAgent,
  buildDashboardAgent,
  quickAnswerAgent
};
