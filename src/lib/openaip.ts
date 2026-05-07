export const openAipConfig = {
  apiKey: import.meta.env.VITE_OPENAIP_API_KEY as string | undefined,
  tiles: {
    base: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    topo: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    airspace:
      "https://{s}.api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png?apiKey={key}",
  },
  attribution: {
    osm: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> | <a href="https://www.openaip.net">OpenAIP</a> | <a href="https://www.safesky.app">SafeSky</a> | <a href="https://www.geonorge.no">Geonorge</a> | <a href="https://www.miljodirektoratet.no">Miljødirektoratet</a> | <a href="https://www.ssb.no">SSB</a> | <a href="https://www.met.no">MET</a> | <a href="https://open-meteo.com">Open-Meteo</a>',
    satellite: '© <a href="https://www.esri.com">Esri</a> | <a href="https://www.openaip.net">OpenAIP</a> | <a href="https://www.safesky.app">SafeSky</a> | <a href="https://www.geonorge.no">Geonorge</a> | <a href="https://www.miljodirektoratet.no">Miljødirektoratet</a> | <a href="https://www.ssb.no">SSB</a> | <a href="https://www.met.no">MET</a> | <a href="https://open-meteo.com">Open-Meteo</a>',
    topo: '© <a href="https://opentopomap.org">OpenTopoMap</a> | <a href="https://www.openaip.net">OpenAIP</a> | <a href="https://www.safesky.app">SafeSky</a> | <a href="https://www.geonorge.no">Geonorge</a> | <a href="https://www.miljodirektoratet.no">Miljødirektoratet</a> | <a href="https://www.ssb.no">SSB</a> | <a href="https://www.met.no">MET</a> | <a href="https://open-meteo.com">Open-Meteo</a>',
    airspace: '© <a href="https://www.openaip.net">OpenAIP</a>',
  },
};
