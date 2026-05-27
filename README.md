# BreatheFlow Health Monitor

BreatheFlow is a Vercel-ready Next.js app for the project:

**Compact Multi-Parameter Health Monitoring System using Micro Venturi Intake and Sensor Fusion for Real-Time Stress Detection**

The app demonstrates:

- Micro Venturi based breathing measurements
- MAX30102 heart rate and SpO2 readings
- MPU6050 posture and motion readings
- Sensor-fusion classification for environmental stress, cardiovascular warning, and physical fatigue
- Live demo scenarios and manual sensor sliders

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Build check

```bash
npm run build
```

## Deploy with Vercel

Option 1: GitHub import

1. Push this folder to a GitHub repository.
2. Go to `https://vercel.com/new`.
3. Import the repository.
4. Keep the detected framework as Next.js.
5. Click Deploy.

Option 2: Vercel CLI

```bash
npm i -g vercel
vercel
vercel --prod
```

No environment variables are required for this prototype.
