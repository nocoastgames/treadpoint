import { HashRouter, Routes, Route } from 'react-router';
import { AuthProvider } from './contexts/AuthContext';
import { APIProvider } from '@vis.gl/react-google-maps';
import Layout from './components/ui/Layout';
import FeedPage from './pages/FeedPage';
import MapPage from './pages/MapPage';
import RidePlannerPage from './pages/RidePlannerPage';
import ExploreTrailsPage from './pages/ExploreTrailsPage';

export default function App() {
  const apiKey = (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY || '';

  return (
    <AuthProvider>
      <APIProvider apiKey={apiKey}>
        <HashRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<FeedPage />} />
              <Route path="explore" element={<ExploreTrailsPage />} />
              <Route path="map" element={<MapPage />} />
              <Route path="ride/:id" element={<RidePlannerPage />} />
            </Route>
          </Routes>
        </HashRouter>
      </APIProvider>
    </AuthProvider>
  );
}
