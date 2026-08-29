import './App.css'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { ProcessedJobsPage } from './pages/ProcessedJobsPage'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/processed-jobs" element={<ProcessedJobsPage />} />
      </Routes>
    </Router>
  )
}

export default App
