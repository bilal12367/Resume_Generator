import "./App.css"


import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import Home from "./pages/home"
<script src="https://cdn.tailwindcss.com"></script>

export const App = () => (
    <Router>
      <Routes>
        <Route path="/" Component={Home} />
      </Routes>
    </Router>
)
