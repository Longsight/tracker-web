import { useCallback, useState, useEffect } from 'react';
import {
  MapContainer, TileLayer, GeoJSON, Popup, Circle,
  CircleMarker, Marker, Polyline, ScaleControl } from 'react-leaflet'
import { ReadyState } from 'react-use-websocket';
import { useWebSocket } from "react-use-websocket/dist/lib/use-websocket";
import './leaflet.css';
import './App.css';
import { parseGPX } from '@we-gold/gpxjs'
import haversine from 'haversine';

const DEBUG = true;

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
  const [fetchedRace, setFetchedRace] = useState(false);
  const [map, setMap] = useState(null);
  const [raceRoute, setRaceRoute] = useState(null);
  const [checkpoints, setCheckpoints] = useState([]);
  const [race, setRace] = useState(null);
  const [waypoints, setWaypoints] = useState([]);
  const [competitors, setCompetitors] = useState([]);
  const [focused, setFocused] = useState(null);
  const [track, setTrack] = useState([]);
  const [timings, setTimings] = useState({});
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

  // Fetch race
  useEffect(() => {
    if (readyState === ReadyState.OPEN && !fetchedRace) {
      setFetchedRace(true);
      sendUpdate({
        command: 'fetchRace',
        race: raceName,
      });
    }
  }, [readyState, fetchedRace]);

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
    if (command == 'fetchRace') {
      setRace(results);
    }
    if (command == 'fetchAll') {
      setCompetitors(results);
      setFocused(results[0].bib);
    }
    if (command == 'fetchCompetitor') {
      if (results) {
        if (Array.isArray(results.track)) {
          setTrack(results.track);
          if (map) {
            const zoom = results.track.slice(-1)[0];
            if (!!zoom) {
              map.setView([zoom.lat, zoom.lon]);
            }
          }
        }
        if (Array.isArray(Object.values(results.timings))) {
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

  var speed = 0;
  if (track.length > 1) {
    const [lastTrack, thisTrack] = track.slice(-2);
    const distanceCovered = haversine({
      latitude: thisTrack.lat,
      longitude: thisTrack.lon,
    }, {
      latitude: lastTrack.lat,
      longitude: lastTrack.lon,
    });
    const timeSince = thisTrack.timestamp - lastTrack.timestamp;
    speed = (distanceCovered * (3600 / timeSince));
  }

  const competitorStatus = (competitor) => {
    switch (competitor.status) {
      case 0:
        return (<span className='competitorStatus retired'>RETIRED</span>);
      default:
        if (!!ping && ((Date.now() / 1000) - ping.timestamp) < 1200) {
          if (speed < 0.5) {
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
        {waypoints.length > 0? competitors.map((competitor) => (
          <Marker 
            key={competitor.bib}
            eventHandlers={{
              click: () => setFocused(competitor.bib),
            }}
            position={[
              competitor.lat ?? waypoints[0].geometry.coordinates[1],
              competitor.lon ?? waypoints[0].geometry.coordinates[0],
            ]}
          >
            <Popup>
              {competitor.bib == focused? (
                <>
                  <strong>{competitor.bib}: {competitor.name}</strong>
                  <table className='statusBox'>
                    <tr>
                      <td>{competitorStatus(competitor)}</td>
                      <td>Speed: {speed.toFixed(1)} km/h</td>
                    </tr>
                    {ping? (
                      <>
                        <tr>
                          <td>Last tracked:</td>
                          <td><strong>{pingText}</strong></td>
                        </tr>
                        <tr>
                          <td>Battery:</td>
                          <td><strong>{ping.bat}%</strong></td>
                        </tr>
                      </>
                    ): null}
                  </table>
                  <table>
                    <thead>
                      <tr><th>Checkpoint</th><th>Timing</th></tr>
                    </thead>
                    <tbody>
                      {checkpoints.map((checkpoint) => {
                        var timing = timings[checkpoint.checkpointid] ?? null;
                        var timeString = null;
                        if (timing) {
                          const dateObj = new Date(timing.timestamp * 1000);
                          timeString = `${days[dateObj.getDay()]} ${dateObj.toLocaleTimeString()}`;
                        }
                        return (
                          <tr key={checkpoint.checkpointid}>
                            <td title={checkpointTitle(checkpoint)}>{checkpoint.name}</td>
                            <td>{timeString}</td>
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
        )): null}
        {track.length > 0? (
          <Polyline
            pathOptions={{ color: 'red' }}
            positions={track.map(tracked => [tracked.lat, tracked.lon])}
          />
        ): null}
        {DEBUG && race? checkpoints.map(checkpoint => JSON.parse(checkpoint.coords).map(point => (
          <Circle
            center={point}
            radius={race.tolerance}
          />
        ))): null}
        <ScaleControl/>
      </MapContainer>
    </>
  )
}

export default App
