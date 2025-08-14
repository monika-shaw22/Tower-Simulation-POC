import './index.css'
import { WindLayer } from 'cesium-wind-layer';
import { czml } from './utils/constatnt';
import * as Cesium from 'cesium';

Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN;

const viewer = new Cesium.Viewer("cesiumContainer", {
    animation: true,
    timeline: false,
    fullscreenButton: true,
    baseLayerPicker: true
});

const philippinesRectangle = Cesium.Rectangle.fromDegrees(
    116.0,
    -10.0,
    127.0,
    20.0
);
viewer.scene.screenSpaceCameraController.minimumZoomDistance = 10;
viewer.scene.screenSpaceCameraController.maximumZoomDistance = 10000;
viewer.scene.screenSpaceCameraController.constrainedRectangle = philippinesRectangle;

const dataSourcePromise = viewer.dataSources.add(
    Cesium.CzmlDataSource.load(czml),
);

dataSourcePromise
    .then(function (dataSource) {
        viewer.trackedEntity = dataSource.entities.getById("animated-tower");
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(124.60, 12.07, 30)
        });
        const clock = viewer.clock;
        clock.shouldAnimate = false;
        const windSlider = document.getElementById("windSlider");
        const windValueDisplay = document.getElementById("windValue");
        windSlider.addEventListener("input", () => {
            const speed = Number(windSlider.value);
            windValueDisplay.textContent = speed;
            if (speed > 80) {
                clock.shouldAnimate = true;
            } else {
                clock.shouldAnimate = false;
            }
        });
    })
    .catch(function (error) {
        console.error(error);
    });

// Load wind data and add WindLayer
let windLayer = null;
let rainTilt = new Cesium.Cartesian2(0.05, 0.0);
let windSpeedFactor = 0.2;
let rainFallSpeed = 0.2;

function loadWindLayer(direction) {
    const fileName = `../public/wind_${direction}.json`;
    fetch(fileName)
        .then(response => response.json())
        .then(data => {
            if (windLayer) {
                windLayer.destroy();
                windLayer = null;
            }
            const windData = {
                ...data,
                bounds: {
                    west: data.bbox[0],
                    south: data.bbox[1],
                    east: data.bbox[2],
                    north: data.bbox[3],
                }
            };
            const windOptions = {
                domain: { min: 0, max: 8 },
                speedFactor: windSpeedFactor,
                lineWidth: { min: 1, max: 2 },
                lineLength: { min: 50, max: 100 },
                particleHeight: 100,
                particlesTextureSize: 200,
                flipY: true,
                useViewerBounds: true,
                dynamic: true,
                colors: ['#fff']
            };
            console.log(windOptions);

            windLayer = new WindLayer(viewer, windData, windOptions);
            windLayer.addEventListener('dataChange', (data) => {
                console.log('Wind data updated:', data);
            });
            windLayer.addEventListener('optionsChange', (options) => {
                console.log('Options updated:', options);
            });
        })
        .catch(error => {
            console.error('Failed to load wind data:', error);
        });
}

loadWindLayer('east');
updateRainTilt('east');

const windSelect = document.getElementById('windDirection');
windSelect.addEventListener('change', (event) => {
    const selectedDirection = event.target.value;
    loadWindLayer(selectedDirection);
    updateRainTilt(selectedDirection);
});


// Add a custom post-process stage for rain effect
const rainFragmentShader = `
uniform sampler2D colorTexture;
uniform float time;
uniform vec2 windDir; // new: direction of tilt
in vec2 v_textureCoordinates;
uniform float rainSpeed; // now dynamic
float rand(vec2 co) {
   return fract(sin(dot(co.xy, vec2(12.9898,78.233))) * 43758.5453);
}
void main(void) {
   vec4 color = texture(colorTexture, v_textureCoordinates);
   // Speed & density
   float speed = rainSpeed; // now dynamic 
   float density = 300.0;

   // If rain speed <= 0.25, show only background
  if (speed <= 0.25) {
      out_FragColor = color;
      return;
  }
   // UV animation
   vec2 uv = v_textureCoordinates;
   float fall = time * speed;

   // Apply tilt that grows as drop falls
    uv.x += windDir.x * fall * 0.1; // tilt horizontally with wind
    uv.y += fall + windDir.y * fall * 0.05; // mostly downward
 

   // Create vertical streaks
   float column = floor(uv.x * density);
   float offset = rand(vec2(column, 0.0));
   float yPos = fract(uv.y + offset);

   // Streak shape
   float drop = smoothstep(0.02, 0.0, yPos);
   float alpha = drop * 0.5;

   vec3 rainColor = vec3(0.7, 0.7, 0.7);
   vec3 finalColor = mix(color.rgb, rainColor, alpha);
   out_FragColor = vec4(finalColor, 1.0);
}
`;

const rainStage = new Cesium.PostProcessStage({
    fragmentShader: rainFragmentShader,
    uniforms: {
        time: () => (performance.now() / 1000.0) % 1000,
        windDir: () => rainTilt,
        rainSpeed: () => rainFallSpeed
    }
});
viewer.scene.postProcessStages.add(rainStage);

function updateRainTilt(direction) {
    const tiltStrength = 0.5;
    switch (direction) {
        case 'east':
            rainTilt = new Cesium.Cartesian2(tiltStrength, 0.0);
            break;
        case 'west':
            rainTilt = new Cesium.Cartesian2(-tiltStrength, 0.0);
            break;
        case 'north':
            rainTilt = new Cesium.Cartesian2(0.0, -tiltStrength);
            break;
        case 'south':
            rainTilt = new Cesium.Cartesian2(0.0, tiltStrength);
            break;
        default:
            rainTilt = new Cesium.Cartesian2(0.0, 0.0);
    }
}


// Wind speed slider → update windSpeedFactor
document.getElementById('windSlider').addEventListener('input', (e) => {
    const value = parseInt(e.target.value, 10);
    document.getElementById('windValue').textContent = value;
    windSpeedFactor = value / 200; // 20km/h → 0.2

    if (windLayer) {
        windLayer.updateOptions({
            speedFactor: windSpeedFactor
        });
    }

});
// Typhoon speed slider → update rain speed
document.getElementById('typhoonSlider').addEventListener('input', (e) => {
    const value = parseInt(e.target.value, 10);
    document.getElementById('typhoonValue').textContent = value;
    rainFallSpeed = value / 200;
});

// Generate a heatmap using CesiumHeatmap
viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(124.60, 12.07, 15000)
});

let bounds = {
    west: 124.40,
    east: 124.70,
    south: 12.01,
    north: 12.10
};

let heatMap = CesiumHeatmap.create(viewer, bounds, {
    maxOpacity: 0.6,
    minOpacity: 0.1,
    blur: 0.85
});

let data = [];
for (let i = 0; i < 1000; i++) {
    data.push({
        x: bounds.west + Math.random() * (bounds.east - bounds.west),
        y: bounds.south + Math.random() * (bounds.north - bounds.south),
        value: Math.floor(Math.random() * 100)
    });
}

heatMap.setWGS84Data(0, 100, data);

heatMap._layer.show = false;
let heatmapLayer = heatMap._layer;
function toggleHeatmap() {
    heatmapLayer.show = !heatmapLayer.show;
}

document.getElementById("toggleHeatmapBtn").addEventListener("click", toggleHeatmap);
