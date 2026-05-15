import * as THREE from 'three';

let scene, camera, renderer, analyser, dataArray;
let centerRing, prongs = [];
const clock = new THREE.Clock();

function init() {
    // SCENE SETUP
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020202);
    scene.fog = new THREE.FogExp2(0x020202, 0.02);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 15);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.body.appendChild(renderer.domElement);

    // 1. CREATE VIBRATING CENTER RING
    // Using a RingGeometry but we will manipulate its outer vertices
    const ringGeo = new THREE.RingGeometry(2.8, 3.0, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true, side: THREE.DoubleSide });
    centerRing = new THREE.Mesh(ringGeo, ringMat);
    scene.add(centerRing);

    // Save the original position of the vertices so we can deform them relative to baseline
    const posAttribute = ringGeo.attributes.position;
    centerRing.userData = {
        originalPositions: posAttribute.clone()
    };

    // 2. CREATE 6 SURROUNDING PRONGS
    const prongGeo = new THREE.BoxGeometry(0.3, 4, 0.3);
    const prongMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true });

    for (let i = 0; i < 6; i++) {
        // Calculate angles at exactly 60-degree steps: (i * 60) * (PI / 180)
        const angle = (i * 60) * (Math.PI / 180);
        const distance = 6.5; // Distance from center

        // Group acts as an anchor point at the center so scaling happens from the outer edge inward
        const pivot = new THREE.Group();
        pivot.rotation.z = angle;
        scene.add(pivot);

        const prong = new THREE.Mesh(prongGeo, prongMat);
        // Position the prong along its local Y axis within the rotated pivot group
        prong.position.y = distance;
        pivot.add(prong);

        prongs.push(prong);
    }

    // 3. AUDIO FILE UPLOAD INTERFACE
    const fileInput = document.getElementById('upload');
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            setupAudio(e.target.files[0]);
            document.querySelector('.custom-upload').style.display = 'none';
            document.getElementById('song-title').innerText = e.target.files[0].name.split('.')[0];
            document.getElementById('song-title').style.opacity = "0.3";
        }
    });

    window.addEventListener('resize', onWindowResize);
    animate();
}

function setupAudio(file) {
    const audioURL = URL.createObjectURL(file);
    const audio = new Audio(audioURL);
    audio.play();

    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const source = ctx.createMediaElementSource(audio);
    analyser = ctx.createAnalyser();
    source.connect(analyser);
    analyser.connect(ctx.destination);

    analyser.fftSize = 256; // Smaller fftSize gives faster, snappier frequency bins
    dataArray = new Uint8Array(analyser.frequencyBinCount);
}

function animate() {
    requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime();
    const delta = clock.getDelta();

    let bass = 0, mid = 0, treble = 0;

    if (analyser) {
        analyser.getByteFrequencyData(dataArray);

        // Extract frequencies across the audio spectrum
        bass = dataArray[2] / 255;
        mid = dataArray[15] / 255;
        treble = dataArray[40] / 255;

        // ANIMATE 6 PRONGS (Scale lengths dynamically to music segments)
        for (let i = 0; i < prongs.length; i++) {
            // Assign different frequencies to different prongs for variety
            let targetScale = 1;
            if (i % 3 === 0) targetScale += bass * 1.8;
            else if (i % 3 === 1) targetScale += mid * 1.5;
            else targetScale += treble * 2.0;

            // Smoothly interpolate prong extension scale
            prongs[i].scale.y = THREE.MathUtils.lerp(prongs[i].scale.y, targetScale, 0.2);
            
            // Subtle rotation twist on high treble spikes
            prongs[i].rotation.z = Math.sin(elapsed * 2) * (treble * 0.2);
        }

        // ANIMATE CENTRAL VIBRATING RING (Vertex Deformation)
        const geo = centerRing.geometry;
        const positionAttribute = geo.attributes.position;
        const origPositions = centerRing.userData.originalPositions;

        for (let i = 0; i < positionAttribute.count; i++) {
            const origX = origPositions.getX(i);
            const origY = origPositions.getY(i);
            
            // Calculate vertex angle relative to center point origin
            const angle = Math.atan2(origY, origX);
            
            // High-frequency compound wave deformation equation
            // $Deformation = \sin(\text{angle} \cdot 8 + \text{elapsed} \cdot 10) \cdot \text{bass} \cdot 0.6$
            const wave = Math.sin(angle * 8 + elapsed * 12) * (bass * 0.5);
            const ripple = Math.cos(angle * 16 - elapsed * 8) * (treble * 0.15);
            
            const totalDeform = 1 + wave + ripple;

            // Apply calculated offset along vector trajectory outward from the center unit axis
            positionAttribute.setXYZ(i, origX * totalDeform, origY * totalDeform, 0);
        }
        positionAttribute.needsUpdate = true; // Tell Three.js the layout grid structural boundaries changed
        
        // Let the whole circle rotate lazily in space
        centerRing.rotation.z = elapsed * 0.1;
    } else {
        // Idle ambient state movement animation before a user uploads a track
        const geo = centerRing.geometry;
        const positionAttribute = geo.attributes.position;
        const origPositions = centerRing.userData.originalPositions;

        for (let i = 0; i < positionAttribute.count; i++) {
            const origX = origPositions.getX(i);
            const origY = origPositions.getY(i);
            const angle = Math.atan2(origY, origX);
            const idleWave = 1 + Math.sin(angle * 4 + elapsed * 2) * 0.05;
            positionAttribute.setXYZ(i, origX * idleWave, origY * idleWave, 0);
        }
        positionAttribute.needsUpdate = true;
    }

    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

init();
