# NatureQuest (GoOutside)

NatureQuest is a collaborative, location-based mobile application designed to encourage people to explore nature. Using real-world data from the iNaturalist API, users can discover and log sightings of local flora and fauna, earn experience points (XP), and collect seeds to grow their profile.

## Features

- **Real-time Map:** Powered by Leaflet, showing your current location and nearby sightings.
- **iNaturalist Integration:** Dynamically fetches species data based on your GPS coordinates.
- **Multiplayer Party:** Join friends using PeerJS to see each other on the map in real-time.
- **Field Guide:** A comprehensive catalog of local species you've discovered.
- **Progressive Web App (PWA):** Built with Capacitor for a native-like experience on Android and iOS.
- **Modern UI:** Responsive design with Tailwind CSS and support for Dark Mode.

## Tech Stack

- **Frontend:** Vanilla JavaScript (ES Modules), HTML5, CSS3.
- **Styling:** Tailwind CSS (via CDN).
- **Mapping:** Leaflet.js.
- **Multiplayer:** PeerJS.
- **Native Bridge:** Capacitor.
- **Data Source:** iNaturalist API.

## Project Structure

- `www/`: Web assets (HTML, CSS, JS).
  - `css/`: Custom styles.
  - `js/`: Modular JavaScript logic.
    - `app.js`: Main entry point and orchestration.
    - `data.js`: API interaction and state defaults.
    - `game.js`: Sighting and quest logic.
    - `hud.js`: Compass and HUD management.
    - `map.js`: Leaflet map integration.
    - `multiplayer.js`: PeerJS networking.
    - `ui.js`: Rendering and panel management.
- `android/`: Capacitor Android project.
- `package.json`: Project dependencies and scripts.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- [Capacitor CLI](https://capacitorjs.com/docs/getting-started)

### Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm start
   ```

### Native Builds

To sync changes to the native projects:
```bash
npm run sync
```

To open the project in Android Studio:
```bash
npm run open:android
```

## Credits

- Species data provided by [iNaturalist](https://www.inaturalist.org/).
- Map tiles by [CartoDB](https://carto.com/).
