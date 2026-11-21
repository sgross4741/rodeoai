import { useState, useEffect } from 'react';
import Landing from './components/Landing.jsx';
import UploadPage from './components/UploadPage.jsx';
import ResultsPage from './components/ResultsPage.jsx';
import { theme } from './components/ui.jsx';

// Simple page state instead of a routing library: 'landing' | 'upload' | 'results'.
export default function App() {
  const [pageName, setPageName] = useState('landing');
  const [video, setVideo] = useState(null); // { url, name, type, duration }
  const [eventId, setEventId] = useState('');
  const [record, setRecord] = useState(null);

  // Free the in-memory video when it is replaced or the app closes.
  useEffect(() => {
    if (!video) return undefined;
    return () => URL.revokeObjectURL(video.url);
  }, [video?.url]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pageName]);

  const startOver = () => {
    setVideo(null);
    setRecord(null);
    setPageName('upload');
  };

  return (
    <div style={{ minHeight: '100vh', background: theme.bg, color: theme.text }}>
      {pageName === 'landing' && <Landing onStart={() => setPageName('upload')} />}
      {pageName === 'upload' && (
        <UploadPage
          eventId={eventId}
          setEventId={setEventId}
          video={video}
          setVideo={setVideo}
          onBack={() => setPageName('landing')}
          onDone={(r) => {
            setRecord(r);
            setPageName('results');
          }}
        />
      )}
      {pageName === 'results' && record && video && (
        <ResultsPage record={record} video={video} onAnother={startOver} />
      )}
    </div>
  );
}
