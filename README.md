# AI Dashboard Agent

An intelligent, AI-powered dashboard application that allows users to upload data files, interact with them using natural language queries, and visualize insights through dynamic charts and analytics.

## Features

### 🤖 AI-Powered Data Analysis
- Natural language query interface powered by OpenAI GPT-4
- Intelligent data interpretation and visualization recommendations
- Context-aware responses based on uploaded data

### 📊 Multi-Format Data Support
- **CSV Files**: Parse and analyze comma-separated values
- **Excel Files**: Support for .xlsx and .xls formats
- **SQL Databases**: Query SQLite databases directly

### 📈 Dynamic Visualizations
- Interactive charts powered by ECharts
- Multiple chart types: Line, Bar, Pie, Scatter, Heatmap, and more
- Real-time chart generation based on AI analysis

### 🎨 Customizable Themes
- **Purple Tech**: Modern purple gradient theme
- **Green Finance**: Professional green theme
- **Dark Modern**: Sleek dark theme with cyan accents
- **Blue Ocean**: Calming blue gradient theme

### 💬 Interactive Chat Interface
- Conversational AI agent for data exploration
- Ask questions about your data in plain English
- Get insights, summaries, and visualizations on demand

## Tech Stack

### Frontend
- **React 18**: Modern UI library
- **Vite**: Fast build tool and dev server
- **ECharts**: Professional charting library
- **PapaParse**: CSV parsing
- **XLSX**: Excel file processing
- **SQL.js**: In-browser SQLite database

### Backend
- **Node.js**: Runtime environment
- **Express**: Web server framework
- **OpenAI API**: GPT-4 for natural language processing
- **Multer**: File upload handling
- **CORS**: Cross-origin resource sharing

## Installation

1. **Clone the repository**
   ```bash
   git clone git@github.com:santhoshchakilamcs/AI-Dashboard-Agent.git
   cd AI-Dashboard-Agent
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   PORT=3001
   ```

4. **Run the application**
   ```bash
   npm run dev
   ```

   This will start both the frontend (Vite dev server) and backend (Express server) concurrently.

5. **Access the application**
   
   Open your browser and navigate to `http://localhost:5173`

## Usage

1. **Upload Data**: Click the upload button and select a CSV, Excel, or SQL file
2. **Ask Questions**: Use the chat interface to ask questions about your data
3. **View Insights**: The AI will analyze your data and generate visualizations
4. **Switch Themes**: Use the theme selector to customize the dashboard appearance

### Example Queries
- "Show me a summary of this data"
- "Create a bar chart of sales by region"
- "What are the top 5 products by revenue?"
- "Show trends over time"
- "Compare categories using a pie chart"

## Project Structure

```
AI-Dashboard-Agent/
├── src/
│   ├── App.jsx          # Main React application
│   └── main.jsx         # React entry point
├── server/
│   ├── index.js         # Express server
│   └── agents.js        # AI agent logic
├── index.html           # HTML template
├── vite.config.js       # Vite configuration
├── package.json         # Dependencies and scripts
└── .gitignore          # Git ignore rules
```

## Scripts

- `npm run dev`: Start both frontend and backend in development mode
- `npm run dev:client`: Start only the Vite dev server
- `npm run dev:server`: Start only the Express server
- `npm run build`: Build for production
- `npm run preview`: Preview production build

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | Your OpenAI API key for GPT-4 access | Yes |
| `PORT` | Backend server port (default: 3001) | No |

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Author

Santhosh Chakilam

## Acknowledgments

- OpenAI for GPT-4 API
- Apache ECharts for visualization library
- React and Vite communities

