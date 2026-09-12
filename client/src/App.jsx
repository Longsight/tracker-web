import { useCallback, useState, useEffect } from 'react';
import {
  MapContainer, TileLayer, GeoJSON, Popup,
  CircleMarker, Marker, Polyline, ScaleControl } from 'react-leaflet'
import { ReadyState } from 'react-use-websocket';
import { useWebSocket } from "react-use-websocket/dist/lib/use-websocket";
import './leaflet.css';
import './App.css';
import { parseGPX } from '@we-gold/gpxjs'

const initial = [53.284784, -1.089135];
const raceName = window.location.pathname.replace('/tracker/', '');

const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const checkpointTitle = (checkpoint) => {
  const cumulative = (checkpoint.cumulative / 1000).toFixed(2);
  const distance = (checkpoint.distance / 1000).toFixed(2);
  return `From start: ${cumulative}km     From last: ${distance}km`;
}

function App() {
  const [fetchedAll, setFetchedAll] = useState(false);
  const [fetchedCompetitor, setFetchedCompetitor] = useState(false);
  const [fetchedCheckpoints, setFetchedCheckpoints] = useState(false);
  const [map, setMap] = useState(null);
  const [raceRoute, setRaceRoute] = useState(null);
  const [checkpoints, setCheckpoints] = useState([]);
  const [waypoints, setWaypoints] = useState([]);
  const [competitors, setCompetitors] = useState([]);
  const [focused, setFocused] = useState(null);
  const [track, setTrack] = useState([]);
  const [timings, setTimings] = useState([]);
  const [ping, setPing] = useState(null);
  
  const socketUrl = `wss://${window.location.hostname}/tracker/ws/`;
  const { sendJsonMessage, lastJsonMessage, readyState } = useWebSocket(socketUrl, {
    retryOnError: true,
    shouldReconnect: () => true,
    reconnectAttempts: Number.MAX_SAFE_INTEGER,
    reconnectInterval: 5000,
  });

  const sendUpdate = useCallback((data) => {
    if (readyState === ReadyState.OPEN) {
      sendJsonMessage(data);
    }
  }, [readyState, sendJsonMessage]);

  // Fetch all competitors
  useEffect(() => {
    if (readyState === ReadyState.OPEN && !fetchedAll) {
      setFetchedAll(true);
      sendUpdate({
        command: 'fetchAll',
        race: raceName,
      });
    }
  }, [readyState, fetchedAll]);

  // Fetch checkpoints
  useEffect(() => {
    if (readyState === ReadyState.OPEN && !fetchedCheckpoints) {
      setFetchedCheckpoints(true);
      sendUpdate({
        command: 'fetchCheckpoints',
        race: raceName,
      });
    }
  }, [readyState, fetchedCheckpoints]);

  // Fetch focused competitor
  useEffect(() => {
    if (readyState === ReadyState.OPEN && !fetchedCompetitor && !!focused) {
      setFetchedCompetitor(true);
      sendUpdate({
        command: 'fetchCompetitor',
        race: raceName,
        opts: {
          competitor: focused
        },
      });
    }
  }, [readyState, fetchedCompetitor, focused]);

  // Process ws response
  useEffect(() => {
    if (!lastJsonMessage || !lastJsonMessage.command) {
      return;
    }
    const { command, results } = lastJsonMessage;
    if (command == 'fetchAll') {
      setCompetitors(results);
    }
    if (command == 'fetchCompetitor') {
      if (results) {
        if (Array.isArray(results.track)) {
          setTrack(results.track);
          if (map) {
            const zoom = results.track.slice(-1)[0];
            map.setView([zoom.lat, zoom.lon]);
          }
        }
        if (Array.isArray(results.timings)) {
          setTimings(results.timings);
        }
        if (!!results.ping) {
          setPing(results.ping);
        }
      }
    }
    if (command == 'fetchCheckpoints') {
      if (Array.isArray(results)) {
        setCheckpoints(results);
      }
    }
  }, [lastJsonMessage]);

  // Page load
  useEffect(() => {
    if (!raceName) {
      return;
    }
    fetch(`./gpx/${raceName}.gpx`).then((response) => {
      if (!response.ok) {
        throw new Error('Failed to fetch the file');
      }
      return response.text();
    }).then((data) => {
      if (!data) {
        throw new Error('Failed to read the data');
      }
      const [parsedFile, error] = parseGPX(data);
      if (error) {
        throw error;
      }
      setRaceRoute(parsedFile.toGeoJSON());
    }).catch((error) => {});
    const interval = setInterval(() => {
      setFetchedAll(false);
      setFetchedCompetitor(false);
    }, 120000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!!raceRoute && Array.isArray(raceRoute.features)) {
      const uniquewps = [];
      const wps = raceRoute.features.filter((feature) => {
        if (feature.geometry.type != 'Point' || !feature.properties.name || uniquewps.includes(feature.properties.name)) {
          return false;
        }
        uniquewps.push(feature.properties.name);
        return true;
      });
      if (map) {
        map.setView(wps[0].geometry.coordinates.slice(0, 2).toReversed());
      }
      setWaypoints(wps);
    } else {
      setWaypoints([]);
    }
  }, [raceRoute]);

  var pingText = null;
  if (!!ping) {
    const pingObj = new Date(ping.timestamp * 1000);
    pingText = `${days[pingObj.getDay()]} ${pingObj.toLocaleTimeString()}`;
  }

  const competitorStatus = (competitor) => {
    switch (competitor.status) {
      case 0:
        return (<span className='competitorStatus retired'>RETIRED</span>);
      default:
        if (!!ping && ((Date.now() / 1000) - ping.timestamp) < 1200) {
          if (competitor.speed < 0.5) {
            return (<span className='competitorStatus inactive'>NOT MOVING</span>);
          }
          return (<span className='competitorStatus active'>ACTIVE</span>);
        }
        return (<span className='competitorStatus inactive'>NO SIGNAL</span>);
    }
  }

  return (
    <>
      <MapContainer
        style={{height: '100%'}}
        center={initial}
        zoom={13}
        scrollWheelZoom={true}
        ref={setMap}
      >
        <TileLayer
          attribution='
            Maps &copy; <a href="https://www.thunderforest.com">Thunderforest</a>,
            Data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors
          '
          url="https://api.thunderforest.com/landscape/{z}/{x}/{y}.png?apikey=ea63e0eb264a40879f6018747cf91273"
        />
        {raceRoute? (
          <>
            <GeoJSON
              data={raceRoute}
              pointToLayer={() => {}}
            >
              {waypoints.map((waypoint, i) => (
                <CircleMarker key={i} center={waypoint.geometry.coordinates.slice(0, 2).toReversed()}>
                  <Popup>
                    {waypoint.properties.name}
                  </Popup>
                </CircleMarker>
              ))}
            </GeoJSON>
          </>
        ): null}
        {competitors.map((competitor) => (
          <Marker 
            key={competitor.bib}
            eventHandlers={{
              click: () => setFocused(competitor.bib),
            }}
            position={[competitor.lat, competitor.lon]}
          >
            <Popup>
              {competitor.bib == focused? (
                <>
                  <strong>{competitor.bib}: {competitor.name}</strong>
                  <table className='statusBox'>
                    <tr>
                      <td>{competitorStatus(competitor)}</td>
                      <td>Speed: {competitor.speed} km/h</td>
                    </tr>
                    <tr>
                      <td>Last tracked:</td>
                      <td><strong>{pingText}</strong></td>
                    </tr>
                    <tr>
                      <td>Battery:</td>
                      <td><strong>{!!ping? `${ping.bat}%`: 'N/A'}</strong></td>
                    </tr>
                  </table>
                  <table>
                    <thead>
                      <tr><th>Checkpoint</th><th>Timing</th></tr>
                    </thead>
                    <tbody>
                      {checkpoints.map((checkpoint, index) => {
                        var timing = null;
                        if (timings[index]) {
                          const dateObj = new Date(timings[index].timestamp * 1000);
                          timing = `${days[dateObj.getDay()]} ${dateObj.toLocaleTimeString()}`;
                        }
                        return (
                          <tr key={index}>
                            <td title={checkpointTitle(checkpoint)}>{checkpoint.name}</td>
                            <td>{timing}</td>
                          </tr>
                        );
                      }
                      )}
                    </tbody>
                  </table>
                </>
              ): null}
            </Popup>
          </Marker>
        ))}
        {track.length > 0? (
          <Polyline pathOptions={{ color: 'red' }} positions={track.map(coords => [coords.lat, coords.lon])}/>
        ): null}
        <ScaleControl/>
      </MapContainer>
    </>
  )
}

export default App
