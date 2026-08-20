import { BrowserRouter, Route, Routes } from 'react-router';
import { HealthPage } from './pages/HealthPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HealthPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
