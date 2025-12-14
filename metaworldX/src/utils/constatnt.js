export const czml = [
    {
        id: "document",
        name: "CZML Model",
        version: "1.0",
        clock: {
            interval: "2019-06-01T16:00:00Z/2019-06-01T16:10:00Z",
            currentTime: "2019-06-01T16:00:00Z",
            multiplier: 1000,
            range: "LOOP_STOP",
            step: "SYSTEM_CLOCK_MULTIPLIER",
        },
    },
    {
        id: "animated-tower",
        name: "Animated Tower",
        position: {
            cartographicDegrees: [124.60, 12.07, 0]
        },
        orientation: {
            epoch: "2019-06-01T16:00:00Z"
        },
        model: {
            gltf: "../../public/tower.glb",
            scale: 0.06, // 50 meters tall
            //minimumPixelSize: 100,
            runAnimations: true,
            heightReference: "CLAMP_TO_GROUND"
        }
    }
];