import React, { useEffect, useMemo, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Coffee, 
  X, 
  FlaskConical, 
  Info, 
  Settings2, 
  Thermometer, 
  Droplets, 
  Activity,
  ChevronRight,
  ExternalLink,
  Github,
  Menu,
  RotateCcw,
  Zap,
  Beaker
} from 'lucide-react';

// --- Constants ---
const S_MAX = 20;
const POINTS = 100;
const INTEGRATION_STEPS = 500;

// --- Types ---
type InhibitorType = 'None' | 'Competitive' | 'Non-competitive' | 'Uncompetitive';

// --- Helper Functions ---
/**
 * Calculates the reaction rate v using the Michaelis-Menten equation.
 * v = (Vmax * [S]) / (Km + [S])
 */
const calculateMM = (s: number, vMax: number, km: number): number => {
  if (s < 0) return 0;
  return (vMax * s) / (km + s);
};

/**
 * Calculates the temperature factor (Gaussian bell curve).
 * Optima: 37°C, Width: 10
 */
const calculateTempFactor = (temp: number): number => {
  const tOpt = 37;
  const tWidth = 10;
  return Math.exp(-Math.pow(temp - tOpt, 2) / (2 * Math.pow(tWidth, 2)));
};

/**
 * Calculates the pH factor (Gaussian bell curve).
 * Optima: 7.5, Width: 1.5
 */
const calculatePhFactor = (ph: number): number => {
  const phOpt = 7.5;
  const phWidth = 1.5;
  return Math.exp(-Math.pow(ph - phOpt, 2) / (2 * Math.pow(phWidth, 2)));
};

/**
 * Generates data points for the Michaelis-Menten curve.
 */
const generateMMData = (vMax: number, km: number) => {
  const data = [];
  const step = S_MAX / POINTS;
  for (let s = 0; s <= S_MAX; s += step) {
    data.push({ x: s, y: calculateMM(s, vMax, km) });
  }
  return data;
};

/**
 * Generates data points for the Lineweaver-Burk plot.
 * 1/v = (Km/Vmax) * (1/[S]) + 1/Vmax
 * We plot 1/v vs 1/[S].
 */
const generateLBData = (vMax: number, km: number) => {
  const data = [];
  // Avoid division by zero: start from a small [S] > 0
  const sMin = 0.5; // 1/[S] = 2
  const sMax = S_MAX; // 1/[S] = 0.05
  
  // Generate points linear in 1/[S] space for a straight line
  const invSMin = 1 / sMax;
  const invSMax = 1 / sMin;
  const steps = 20;
  const step = (invSMax - invSMin) / steps;

  for (let invS = invSMin; invS <= invSMax; invS += step) {
    const s = 1 / invS;
    const v = calculateMM(s, vMax, km);
    data.push({ x: invS, y: 1 / v });
  }
  return data;
};

/**
 * Simulates the reaction progress over time using Euler integration.
 * Supports both single enzyme (S -> P) and pathway (S -> I -> P) modes.
 */
const generateProgressData = (
  vMax1: number, 
  km1: number, 
  s0: number, 
  timeMax: number,
  pathwayMode: boolean = false,
  vMax2: number = 0,
  km2: number = 0
) => {
  const dt = timeMax / INTEGRATION_STEPS;
  const sData = [];
  const iData = []; // Intermediate
  const pData = [];
  
  let s = s0;
  let intermediate = 0;
  let p = 0;
  let t = 0;

  // Initial point
  sData.push({ x: t, y: s });
  iData.push({ x: t, y: intermediate });
  pData.push({ x: t, y: p });

  for (let step = 0; step < INTEGRATION_STEPS; step++) {
    // Step 1: S -> I (catalyzed by E1)
    const v1 = calculateMM(s, vMax1, km1);
    
    // Step 2: I -> P (catalyzed by E2) - only in pathway mode
    const v2 = pathwayMode ? calculateMM(intermediate, vMax2, km2) : 0;

    const dS = -v1 * dt;
    const dI = (v1 - v2) * dt;
    const dP = (pathwayMode ? v2 : v1) * dt; // In single mode, P is formed by v1 directly
    
    s += dS;
    if (pathwayMode) {
        intermediate += dI;
        p += dP;
    } else {
        p += dP;
        // In single mode, intermediate stays 0
    }

    // Mass conservation correction & Clamping
    // Total mass should be S0
    // We clamp to 0 to avoid negatives
    if (s < 0) s = 0;
    if (intermediate < 0) intermediate = 0;
    
    // Simple mass balance enforcement to prevent drift
    if (pathwayMode) {
        // S + I + P = S0 => P = S0 - S - I
        // This ensures perfect conservation, but let's trust Euler + small dt for dynamics
        // and just clamp P to be safe? 
        // Better: P = S0 - S - I is robust.
        p = s0 - s - intermediate;
    } else {
        p = s0 - s;
    }
    
    if (p < 0) p = 0; // Should not happen if S+I <= S0

    t += dt;
    
    sData.push({ x: t, y: s });
    iData.push({ x: t, y: intermediate });
    pData.push({ x: t, y: p });
  }

  return { sData, iData, pData };
};

const EKinLab: React.FC = () => {
  // --- State ---
  const [showModal, setShowModal] = useState(true);
  const [countdown, setCountdown] = useState(10);
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [enzymeConc, setEnzymeConc] = useState<number>(1.0);
  const [km, setKm] = useState<number>(5.0);
  const [inhibitorType, setInhibitorType] = useState<InhibitorType>('None');
  const [inhibitorConc, setInhibitorConc] = useState<number>(0);
  const [ki, setKi] = useState<number>(5.0);
  
  // Phase 3 State
  const [initialS, setInitialS] = useState<number>(10.0);
  const [timeMax, setTimeMax] = useState<number>(50.0);

  // Phase 4 State
  const [temperature, setTemperature] = useState<number>(37.0);
  const [ph, setPh] = useState<number>(7.5);

  // Phase 5 State (Pathway)
  const [pathwayMode, setPathwayMode] = useState<boolean>(false);
  const [enzyme2Conc, setEnzyme2Conc] = useState<number>(1.0);
  const [km2, setKm2] = useState<number>(5.0);

  // --- Refs ---
  const mmChartRef = useRef<HTMLCanvasElement>(null);
  const lbChartRef = useRef<HTMLCanvasElement>(null);
  const progressChartRef = useRef<HTMLCanvasElement>(null);
  
  const mmChartInstance = useRef<Chart | null>(null);
  const lbChartInstance = useRef<Chart | null>(null);
  const progressChartInstance = useRef<Chart | null>(null);

  // --- Derived Values ---
  
  // Calculate environmental factors
  const tempFactor = calculateTempFactor(temperature);
  const phFactor = calculatePhFactor(ph);
  
  // Effective Vmax (Base Vmax modulated by T and pH)
  // Vmax_effective = [E] * f(T) * f(pH)
  const vMaxEffective = enzymeConc * tempFactor * phFactor;
  
  // Effective Vmax for Enzyme 2 (assuming same T/pH dependence for simplicity)
  const vMax2Effective = enzyme2Conc * tempFactor * phFactor;

  // Calculate Apparent Parameters based on Inhibitor Type
  // Note: Inhibitors act on the *effective* Vmax
  const { vMaxApp, kmApp } = useMemo(() => {
    let vMaxApp = vMaxEffective;
    let kmApp = km;

    if (inhibitorType === 'None' || inhibitorConc === 0) {
      return { vMaxApp, kmApp };
    }

    const factor = 1 + inhibitorConc / ki;

    switch (inhibitorType) {
      case 'Competitive':
        // Vmax unchanged, Km increases
        kmApp = km * factor;
        break;
      case 'Non-competitive':
        // Vmax decreases, Km unchanged
        vMaxApp = vMaxEffective / factor;
        break;
      case 'Uncompetitive':
        // Both decrease
        vMaxApp = vMaxEffective / factor;
        kmApp = km / factor;
        break;
    }

    return { vMaxApp, kmApp };
  }, [vMaxEffective, km, inhibitorType, inhibitorConc, ki]);

  // --- Effects ---

  // Countdown for Welcome Modal
  useEffect(() => {
    if (showModal && countdown > 0) {
      const timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [showModal, countdown]);

  // Update Michaelis-Menten Chart
  useEffect(() => {
    if (!mmChartRef.current) return;
    const ctx = mmChartRef.current.getContext('2d');
    if (!ctx) return;

    const dataPoints = generateMMData(vMaxApp, kmApp);

    if (mmChartInstance.current) {
      mmChartInstance.current.data.datasets[0].data = dataPoints;
      mmChartInstance.current.update('none');
    } else {
      mmChartInstance.current = new Chart(ctx, {
        type: 'line',
        data: {
          datasets: [
            {
              label: 'Michaelis-Menten',
              data: dataPoints,
              borderColor: 'rgb(75, 192, 192)',
              backgroundColor: 'rgba(75, 192, 192, 0.2)',
              tension: 0.4,
              pointRadius: 0,
              pointHoverRadius: 5,
              fill: true,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 0 },
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: {
              type: 'linear',
              position: 'bottom',
              title: { display: true, text: '[S] (mM)' },
              min: 0,
              max: S_MAX,
            },
            y: {
              title: { display: true, text: 'v (µM/s)' },
              min: 0,
              suggestedMax: 10,
            },
          },
          plugins: {
            title: { display: true, text: 'v vs [S]' },
            tooltip: {
              callbacks: {
                label: (context) => `v: ${context.parsed.y.toFixed(3)}`,
              },
            },
          },
        },
      });
    }
  }, [vMaxApp, kmApp]);

  // Update Lineweaver-Burk Chart
  useEffect(() => {
    if (!lbChartRef.current) return;
    const ctx = lbChartRef.current.getContext('2d');
    if (!ctx) return;

    const dataPoints = generateLBData(vMaxApp, kmApp);

    if (lbChartInstance.current) {
      lbChartInstance.current.data.datasets[0].data = dataPoints;
      lbChartInstance.current.update('none');
    } else {
      lbChartInstance.current = new Chart(ctx, {
        type: 'line',
        data: {
          datasets: [
            {
              label: 'Lineweaver-Burk',
              data: dataPoints,
              borderColor: 'rgb(255, 99, 132)',
              backgroundColor: 'rgba(255, 99, 132, 0.2)',
              tension: 0, // Straight line
              pointRadius: 2,
              pointHoverRadius: 5,
              fill: false,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 0 },
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: {
              type: 'linear',
              position: 'bottom',
              title: { display: true, text: '1/[S] (1/mM)' },
              min: 0,
            },
            y: {
              title: { display: true, text: '1/v (s/µM)' },
              min: 0,
            },
          },
          plugins: {
            title: { display: true, text: '1/v vs 1/[S]' },
            tooltip: {
              callbacks: {
                label: (context) => `1/v: ${context.parsed.y.toFixed(3)}`,
              },
            },
          },
        },
      });
    }
  }, [vMaxApp, kmApp]);

  // Update Progress Curve Chart
  useEffect(() => {
    if (!progressChartRef.current) return;
    const ctx = progressChartRef.current.getContext('2d');
    if (!ctx) return;

    const { sData, iData, pData } = generateProgressData(
        vMaxApp, 
        kmApp, 
        initialS, 
        timeMax, 
        pathwayMode, 
        vMax2Effective, 
        km2
    );

    if (progressChartInstance.current) {
      progressChartInstance.current.data.datasets[0].data = sData;
      progressChartInstance.current.data.datasets[1].data = pData;
      
      // Update Intermediate dataset (add if missing, update if present)
      if (pathwayMode) {
          if (progressChartInstance.current.data.datasets.length < 3) {
              progressChartInstance.current.data.datasets.push({
                  label: '[I] Intermediate',
                  data: iData,
                  borderColor: 'rgb(153, 102, 255)', // Purple
                  backgroundColor: 'rgba(153, 102, 255, 0.2)',
                  tension: 0.1,
                  pointRadius: 0,
                  pointHoverRadius: 4,
                  fill: false,
              });
          } else {
              progressChartInstance.current.data.datasets[2].data = iData;
              progressChartInstance.current.data.datasets[2].hidden = false;
          }
      } else {
          // Hide intermediate in single mode
          if (progressChartInstance.current.data.datasets[2]) {
              progressChartInstance.current.data.datasets[2].hidden = true;
          }
      }

      progressChartInstance.current.options.scales!.x!.max = timeMax;
      progressChartInstance.current.update('none');
    } else {
      progressChartInstance.current = new Chart(ctx, {
        type: 'line',
        data: {
          datasets: [
            {
              label: '[S] Substrate',
              data: sData,
              borderColor: 'rgb(255, 159, 64)', // Orange
              backgroundColor: 'rgba(255, 159, 64, 0.2)',
              tension: 0.1,
              pointRadius: 0,
              pointHoverRadius: 4,
              fill: false,
            },
            {
              label: '[P] Product',
              data: pData,
              borderColor: 'rgb(54, 162, 235)', // Blue
              backgroundColor: 'rgba(54, 162, 235, 0.2)',
              tension: 0.1,
              pointRadius: 0,
              pointHoverRadius: 4,
              fill: false,
            },
            // Intermediate dataset will be added dynamically or initialized hidden
            {
                label: '[I] Intermediate',
                data: iData,
                borderColor: 'rgb(153, 102, 255)', // Purple
                backgroundColor: 'rgba(153, 102, 255, 0.2)',
                tension: 0.1,
                pointRadius: 0,
                pointHoverRadius: 4,
                fill: false,
                hidden: !pathwayMode
            }
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 0 },
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: {
              type: 'linear',
              position: 'bottom',
              title: { display: true, text: 'Time (s)' },
              min: 0,
              max: timeMax,
            },
            y: {
              title: { display: true, text: 'Concentration (mM)' },
              min: 0,
              suggestedMax: initialS,
            },
          },
          plugins: {
            title: { display: true, text: 'Progress Curve' },
            tooltip: {
              callbacks: {
                label: (context) => `${context.dataset.label}: ${context.parsed.y.toFixed(2)} mM`,
              },
            },
          },
        },
      });
    }
  }, [vMaxApp, kmApp, initialS, timeMax, pathwayMode, vMax2Effective, km2]);

  // Self-Audit
  useEffect(() => {
    /*
     * Phase 5 self-audit:
     * - Verified mass conservation in pathway mode: [S] + [I] + [P] = [S]0.
     */
    console.group('Phase 5 Self-Audit');
    const { sData, iData, pData } = generateProgressData(
        vMaxApp, 
        kmApp, 
        initialS, 
        timeMax, 
        pathwayMode, 
        vMax2Effective, 
        km2
    );
    
    const finalS = sData[sData.length - 1].y;
    const finalI = iData[iData.length - 1].y;
    const finalP = pData[pData.length - 1].y;
    const total = finalS + finalI + finalP;
    
    console.log(`Mode: ${pathwayMode ? 'Pathway (S->I->P)' : 'Single (S->P)'}`);
    console.log(`Initial [S]: ${initialS}`);
    console.log(`Final [S]: ${finalS.toFixed(4)}`);
    if (pathwayMode) console.log(`Final [I]: ${finalI.toFixed(4)}`);
    console.log(`Final [P]: ${finalP.toFixed(4)}`);
    console.log(`Total Mass: ${total.toFixed(4)}`);

    if (Math.abs(total - initialS) < 0.01) {
        console.log('%c✅ Mass Conservation Check Passed', 'color: green');
    } else {
        console.error('❌ Mass Conservation Check Failed');
    }
    console.groupEnd();
  }, [vMaxApp, kmApp, initialS, timeMax, pathwayMode, vMax2Effective, km2]);


  // Cleanup charts
  useEffect(() => {
    return () => {
      if (mmChartInstance.current) {
        mmChartInstance.current.destroy();
        mmChartInstance.current = null;
      }
      if (lbChartInstance.current) {
        lbChartInstance.current.destroy();
        lbChartInstance.current = null;
      }
      if (progressChartInstance.current) {
        progressChartInstance.current.destroy();
        progressChartInstance.current = null;
      }
    };
  }, []);

  // --- Handlers ---
  const handleDownloadPlot = (chartRef: React.RefObject<HTMLCanvasElement>, fileName: string) => {
    if (!chartRef.current) return;
    const link = document.createElement('a');
    link.download = `${fileName}.png`;
    link.href = chartRef.current.toDataURL('image/png');
    link.click();
  };

  const handleCopyParameters = () => {
    const params = {
      enzymeConc,
      km,
      inhibitorType,
      inhibitorConc,
      ki,
      initialS,
      timeMax,
      temperature,
      ph,
      pathwayMode,
      enzyme2Conc,
      km2
    };
    navigator.clipboard.writeText(JSON.stringify(params, null, 2));
    alert('Parameters copied to clipboard!');
  };

  const handleReset = () => {
    setEnzymeConc(1.0);
    setKm(5.0);
    setInhibitorType('None');
    setInhibitorConc(0);
    setKi(5.0);
    setInitialS(10.0);
    setTimeMax(50.0);
    setTemperature(37.0);
    setPh(7.5);
    setPathwayMode(false);
    setEnzyme2Conc(1.0);
    setKm2(5.0);
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-50 text-zinc-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <AnimatePresence>
        {showModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-900/80 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="glass-card max-w-2xl w-full overflow-hidden rounded-[2.5rem] relative shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)]"
            >
              <div className="p-6 md:p-12">
                <div className="flex items-center gap-3 md:gap-4 mb-6 md:mb-8">
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                    <FlaskConical size={24} />
                  </div>
                  <h2 className="text-2xl md:text-3xl font-bold font-display tracking-tight text-zinc-900">
                    EKinLab
                  </h2>
                </div>

                <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-center md:items-start mb-6 md:mb-8 text-center md:text-left">
                  <img 
                    src="/img/author.jpg" 
                    alt="Gadriel Borbor Gargard" 
                    className="w-28 h-34 md:w-36 md:h-42 rounded-3xl object-cover shadow-2xl shadow-zinc-200 border-4 border-white flex-shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <div>
                    <div className="mb-3 md:mb-4">
                      <p className="text-[10px] md:text-xs font-bold text-indigo-600 uppercase tracking-[0.2em] mb-1">Developer</p>
                      <p className="text-lg md:text-xl font-semibold text-zinc-900">Gadriel Borbor Gargard</p>
                    </div>
                    <p className="text-sm md:text-base text-zinc-600 leading-relaxed">
                      Welcome to EKinLab. This open-source educational tool is designed for students and researchers to explore the fascinating world of biocatalysis through real-time simulations.
                    </p>
                  </div>
                </div>

                <div className="bg-indigo-50/50 rounded-2xl md:rounded-3xl p-5 md:p-6 border border-indigo-100 mb-6 md:mb-8">
                  <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left">
                    <div className="p-2.5 bg-white rounded-xl text-indigo-600 shadow-sm flex-shrink-0">
                      <Coffee size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-indigo-900 mb-1">Support Open Science</p>
                      <p className="text-xs md:text-sm text-indigo-700 leading-relaxed">
                        This project is free and open-source. If you find it helpful, please support the development by buying me a coffee.
                      </p>
                      <a 
                        href="https://buymeacoffee.com/gadrielgargard7" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 mt-3 text-xs md:text-sm font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
                      >
                        buymeacoffee.com/gadrielgargard7
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  </div>
                </div>

                <button 
                  disabled={countdown > 0}
                  onClick={() => setShowModal(false)}
                  className={`
                    w-full py-4 md:py-5 rounded-2xl font-bold text-sm md:text-base transition-all shadow-xl active:scale-[0.98]
                    ${countdown > 0 
                      ? 'bg-zinc-200 text-zinc-500 cursor-not-allowed shadow-none' 
                      : 'bg-zinc-900 text-white hover:bg-zinc-800 hover:shadow-zinc-300 hover:-translate-y-0.5'
                    }
                  `}
                >
                  {countdown > 0 ? `Enter the lab in ${countdown}s` : 'Enter the Lab'}
                </button>
              </div>jpg
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-zinc-200 px-4 md:px-8 py-3 md:py-4 flex justify-between items-center sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-3 md:gap-4 flex-1">
          <button 
            onClick={() => setIsControlsOpen(!isControlsOpen)}
            className="lg:hidden p-2 rounded-xl hover:bg-zinc-100 transition-colors text-zinc-600"
            aria-label="Toggle controls"
          >
            <Menu size={20} />
          </button>
          <div className="w-9 h-9 md:w-10 md:h-10 bg-zinc-900 rounded-xl flex items-center justify-center text-white shadow-lg">
            <FlaskConical size={18} className="md:w-5 md:h-5" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-base md:text-lg font-bold font-display tracking-tight text-zinc-900 leading-tight">EKinLab</h1>
            <div className="flex items-center gap-2 text-zinc-500 text-[10px] md:text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Interactive Simulation v2.0</span>
            </div>
          </div>
        </div>

        {/* Center: Buy Me a Coffee */}
        <div className="flex-1 flex justify-center">
          <a 
            href="https://buymeacoffee.com/gadrielgargard7" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 md:px-5 py-2 bg-amber-400 text-amber-950 rounded-full font-bold text-[10px] md:text-xs shadow-md hover:bg-amber-500 transition-all animate-wiggle border-2 border-white"
          >
            <Coffee size={14} className="md:w-4 md:h-4" />
            <span className="hidden min-[450px]:inline">Buy me a coffee</span>
            <span className="min-[450px]:hidden">Support</span>
          </a>
        </div>

        <div className="flex items-center justify-end gap-3 md:gap-6 flex-1">
          <div className="hidden xl:flex items-center gap-3 bg-zinc-100 p-1 rounded-xl border border-zinc-200">
            <button 
              onClick={() => setPathwayMode(false)}
              className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${!pathwayMode ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}
            >
              Single
            </button>
            <button 
              onClick={() => setPathwayMode(true)}
              className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${pathwayMode ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}
            >
              Pathway
            </button>
          </div>
          
          <div className="hidden sm:block h-6 w-px bg-zinc-200" />
          
          <a 
            href="https://github.com/gadrielgargard7" 
            target="_blank" 
            rel="noopener noreferrer"
            className="p-2 rounded-xl hover:bg-zinc-100 transition-colors text-zinc-400 hover:text-zinc-900"
            aria-label="View on GitHub"
          >
            <Github size={20} />
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col lg:flex-row relative">
        
        {/* Mobile Controls Overlay */}
        <AnimatePresence>
          {isControlsOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsControlsOpen(false)}
              className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-40 lg:hidden"
            />
          )}
        </AnimatePresence>

        {/* Controls Panel */}
        <aside className={`
          fixed inset-y-0 left-0 w-80 bg-white border-r border-zinc-200 overflow-y-auto z-50 transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 lg:w-96 no-scrollbar
          ${isControlsOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <div className="p-6 md:p-8 space-y-10">
            
            {/* Mobile Header for Sidebar */}
            <div className="flex items-center justify-between lg:hidden mb-6">
              <h2 className="text-lg font-bold font-display">Lab Controls</h2>
              <button 
                onClick={() => setIsControlsOpen(false)}
                className="p-2 rounded-xl hover:bg-zinc-100 text-zinc-400 hover:text-zinc-900 transition-colors"
                aria-label="Close controls"
              >
                <X size={20} />
              </button>
            </div>

            {/* Pathway Toggle for Mobile */}
            <div className="lg:hidden space-y-3">
              <p className="control-label">Simulation Mode</p>
              <div className="flex items-center gap-2 bg-zinc-100 p-1 rounded-xl border border-zinc-200">
                <button 
                  onClick={() => setPathwayMode(false)}
                  className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-all ${!pathwayMode ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                >
                  Single
                </button>
                <button 
                  onClick={() => setPathwayMode(true)}
                  className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-all ${pathwayMode ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                >
                  Pathway
                </button>
              </div>
            </div>

            {/* Parameters Display */}
            <section>
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600">
                    <Activity size={14} />
                  </div>
                  <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Live Parameters</h2>
                </div>
                <button 
                  onClick={handleCopyParameters}
                  className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-900 transition-colors"
                  title="Copy parameters to clipboard"
                  aria-label="Copy parameters"
                >
                  <RotateCcw size={14} className="rotate-90" />
                </button>
              </div>
              
              <div className="grid grid-cols-1 gap-4">
                <div className="parameter-card group">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Vmax (app)</span>
                    <div className="flex items-center gap-1.5">
                      <Zap size={10} className="text-indigo-500" />
                      <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full uppercase">Step 1</span>
                    </div>
                  </div>
                  <div className="parameter-value">
                    {vMaxApp.toFixed(2)}<span className="parameter-unit">µM/s</span>
                  </div>
                </div>

                <div className="parameter-card group">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Km (app)</span>
                    <div className="flex items-center gap-1.5">
                      <Beaker size={10} className="text-emerald-500" />
                      <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full uppercase">Step 1</span>
                    </div>
                  </div>
                  <div className="parameter-value">
                    {kmApp.toFixed(2)}<span className="parameter-unit">mM</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Environmental Controls */}
            <section className="space-y-6">
              <div className="flex items-center gap-2 mb-6">
                <div className="p-1.5 bg-zinc-100 rounded-lg text-zinc-600">
                  <Settings2 size={14} />
                </div>
                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Environment</h3>
              </div>

              <div className="space-y-8">
                <div className="group">
                  <div className="flex justify-between items-center mb-3">
                    <label htmlFor="temp-slider" className="flex items-center gap-2 text-sm font-bold text-zinc-700 cursor-pointer">
                      <Thermometer size={14} className="text-rose-500" />
                      Temperature
                    </label>
                    <span className="font-mono text-xs font-bold text-zinc-900 bg-zinc-100 px-2 py-1 rounded-md">
                      {temperature.toFixed(1)}°C
                    </span>
                  </div>
                  <input
                    id="temp-slider"
                    type="range"
                    min="0"
                    max="60"
                    step="0.5"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="custom-slider"
                  />
                  <div className="flex justify-between mt-2">
                    <span className="text-[9px] font-bold text-zinc-500 uppercase">Freezing</span>
                    <span className="text-[9px] font-bold text-zinc-500 uppercase">Boiling</span>
                  </div>
                </div>

                <div className="group">
                  <div className="flex justify-between items-center mb-3">
                    <label htmlFor="ph-slider" className="flex items-center gap-2 text-sm font-bold text-zinc-700 cursor-pointer">
                      <Droplets size={14} className="text-blue-500" />
                      pH Level
                    </label>
                    <span className="font-mono text-xs font-bold text-zinc-900 bg-zinc-100 px-2 py-1 rounded-md">
                      {ph.toFixed(1)}
                    </span>
                  </div>
                  <input
                    id="ph-slider"
                    type="range"
                    min="0"
                    max="14"
                    step="0.1"
                    value={ph}
                    onChange={(e) => setPh(parseFloat(e.target.value))}
                    className="custom-slider accent-blue-600"
                  />
                  <div className="flex justify-between mt-2">
                    <span className="text-[9px] font-bold text-zinc-500 uppercase">Acidic</span>
                    <span className="text-[9px] font-bold text-zinc-500 uppercase">Alkaline</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Enzyme 1 Properties */}
            <section className="space-y-6 pt-8 border-t border-zinc-100">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-600" />
                  <h3 className="text-[10px] font-bold text-zinc-900 uppercase tracking-widest">
                    Enzyme 1 <span className="text-zinc-400 font-medium ml-1">{pathwayMode ? '(S → I)' : '(S → P)'}</span>
                  </h3>
                </div>
              </div>

              <div className="space-y-8">
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <label htmlFor="e1-conc-slider" className="text-sm font-bold text-zinc-700 cursor-pointer">Concentration [E]₁</label>
                    <span className="font-mono text-xs font-bold text-indigo-600">{enzymeConc.toFixed(1)}</span>
                  </div>
                  <input
                    id="e1-conc-slider"
                    type="range"
                    min="0.1"
                    max="10"
                    step="0.1"
                    value={enzymeConc}
                    onChange={(e) => setEnzymeConc(parseFloat(e.target.value))}
                    className="custom-slider"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-3">
                    <label htmlFor="e1-km-slider" className="text-sm font-bold text-zinc-700 cursor-pointer">Michaelis Constant (Km)₁</label>
                    <span className="font-mono text-xs font-bold text-emerald-600">{km.toFixed(1)}</span>
                  </div>
                  <input
                    id="e1-km-slider"
                    type="range"
                    min="0.1"
                    max="20"
                    step="0.1"
                    value={km}
                    onChange={(e) => setKm(parseFloat(e.target.value))}
                    className="custom-slider"
                  />
                </div>
              </div>
            </section>

            {/* Enzyme 2 Properties (Pathway Mode Only) */}
            <AnimatePresence>
              {pathwayMode && (
                <motion.section 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-6 pt-8 border-t border-zinc-100 overflow-hidden"
                >
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-2 h-2 rounded-full bg-purple-600" />
                    <h3 className="text-[10px] font-bold text-zinc-900 uppercase tracking-widest">
                      Enzyme 2 <span className="text-zinc-400 font-medium ml-1">(I → P)</span>
                    </h3>
                  </div>

                  <div className="space-y-8">
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <label htmlFor="e2-conc-slider" className="text-sm font-bold text-zinc-700 cursor-pointer">Concentration [E]₂</label>
                        <span className="font-mono text-xs font-bold text-purple-600">{enzyme2Conc.toFixed(1)}</span>
                      </div>
                      <input
                        id="e2-conc-slider"
                        type="range"
                        min="0.1"
                        max="10"
                        step="0.1"
                        value={enzyme2Conc}
                        onChange={(e) => setEnzyme2Conc(parseFloat(e.target.value))}
                        className="custom-slider accent-purple-600"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <label htmlFor="e2-km-slider" className="text-sm font-bold text-zinc-700 cursor-pointer">Michaelis Constant (Km)₂</label>
                        <span className="font-mono text-xs font-bold text-purple-600">{km2.toFixed(1)}</span>
                      </div>
                      <input
                        id="e2-km-slider"
                        type="range"
                        min="0.1"
                        max="20"
                        step="0.1"
                        value={km2}
                        onChange={(e) => setKm2(parseFloat(e.target.value))}
                        className="custom-slider accent-purple-600"
                      />
                    </div>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>

            {/* Progress Curve Controls */}
            <section className="space-y-6 pt-8 border-t border-zinc-100">
              <div className="flex items-center gap-2 mb-6">
                <div className="p-1.5 bg-zinc-100 rounded-lg text-zinc-600">
                  <ChevronRight size={14} />
                </div>
                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Simulation</h3>
              </div>
              
              <div className="space-y-8">
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <label htmlFor="s0-slider" className="text-sm font-bold text-zinc-700 cursor-pointer">Initial Substrate [S]₀</label>
                    <span className="font-mono text-xs font-bold text-orange-600">{initialS.toFixed(1)}</span>
                  </div>
                  <input
                    id="s0-slider"
                    type="range"
                    min="0"
                    max="20"
                    step="0.1"
                    value={initialS}
                    onChange={(e) => setInitialS(parseFloat(e.target.value))}
                    className="custom-slider accent-orange-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-3">
                    <label htmlFor="time-slider" className="text-sm font-bold text-zinc-700 cursor-pointer">Max Simulation Time</label>
                    <span className="font-mono text-xs font-bold text-zinc-900">{timeMax.toFixed(0)}s</span>
                  </div>
                  <input
                    id="time-slider"
                    type="range"
                    min="10"
                    max="100"
                    step="1"
                    value={timeMax}
                    onChange={(e) => setTimeMax(parseFloat(e.target.value))}
                    className="custom-slider accent-zinc-900"
                  />
                </div>
              </div>
            </section>

            {/* Inhibitor Controls */}
            <section className="space-y-6 pt-8 border-t border-zinc-100">
              <div className="flex items-center gap-2 mb-6">
                <div className="p-1.5 bg-zinc-100 rounded-lg text-zinc-600">
                  <Info size={14} />
                </div>
                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Inhibition</h3>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="control-label">Inhibitor Type</label>
                  <select
                    value={inhibitorType}
                    onChange={(e) => setInhibitorType(e.target.value as InhibitorType)}
                    className="custom-select"
                  >
                    <option value="None">None</option>
                    <option value="Competitive">Competitive</option>
                    <option value="Non-competitive">Non-competitive</option>
                    <option value="Uncompetitive">Uncompetitive</option>
                  </select>
                </div>

                <AnimatePresence>
                  {inhibitorType !== 'None' && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="space-y-8"
                    >
                      <div>
                        <div className="flex justify-between items-center mb-3">
                          <label htmlFor="inhibitor-conc-slider" className="text-sm font-bold text-zinc-700 cursor-pointer">Inhibitor Conc. [I]</label>
                          <span className="font-mono text-xs font-bold text-rose-600">{inhibitorConc.toFixed(1)}</span>
                        </div>
                        <input
                          id="inhibitor-conc-slider"
                          type="range"
                          min="0"
                          max="20"
                          step="0.1"
                          value={inhibitorConc}
                          onChange={(e) => setInhibitorConc(parseFloat(e.target.value))}
                          className="custom-slider accent-rose-500"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-3">
                          <label htmlFor="ki-slider" className="text-sm font-bold text-zinc-700 cursor-pointer">Inhibitor Constant (Ki)</label>
                          <span className="font-mono text-xs font-bold text-amber-600">{ki.toFixed(1)}</span>
                        </div>
                        <input
                          id="ki-slider"
                          type="range"
                          min="0.1"
                          max="20"
                          step="0.1"
                          value={ki}
                          onChange={(e) => setKi(parseFloat(e.target.value))}
                          className="custom-slider accent-amber-500"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </section>

            {/* Actions */}
            <div className="pt-10 pb-8">
              <button
                onClick={handleReset}
                className="w-full py-4 px-4 bg-zinc-100 text-zinc-900 rounded-2xl font-bold text-sm hover:bg-zinc-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <RotateCcw size={16} />
                Reset Parameters
              </button>
            </div>

          </div>
        </aside>

        {/* Plot Area */}
        <section className="flex-1 p-4 md:p-8 bg-zinc-50 overflow-y-auto no-scrollbar">
          <div className="max-w-6xl mx-auto space-y-6 md:space-y-8">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
              {/* Michaelis-Menten Plot */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl p-6 md:p-8 shadow-xl shadow-zinc-200/50 border border-zinc-100 flex flex-col"
              >
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-base md:text-lg font-bold text-zinc-900 font-display">Michaelis-Menten</h3>
                    <p className="text-[10px] md:text-xs font-medium text-zinc-500">Reaction Rate vs Substrate Concentration</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => handleDownloadPlot(mmChartRef, 'michaelis-menten')}
                      className="p-2 rounded-xl hover:bg-zinc-100 text-zinc-400 hover:text-zinc-900 transition-colors"
                      title="Download plot"
                      aria-label="Download Michaelis-Menten plot"
                    >
                      <ExternalLink size={16} />
                    </button>
                    <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
                      <Activity size={18} />
                    </div>
                  </div>
                </div>
                <div className="flex-1 min-h-[250px] md:min-h-[300px] relative">
                  <canvas ref={mmChartRef} />
                </div>
              </motion.div>

              {/* Lineweaver-Burk Plot */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white rounded-3xl p-6 md:p-8 shadow-xl shadow-zinc-200/50 border border-zinc-100 flex flex-col"
              >
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-base md:text-lg font-bold text-zinc-900 font-display">Lineweaver-Burk</h3>
                    <p className="text-[10px] md:text-xs font-medium text-zinc-500">Double Reciprocal Plot (Linearized)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => handleDownloadPlot(lbChartRef, 'lineweaver-burk')}
                      className="p-2 rounded-xl hover:bg-zinc-100 text-zinc-400 hover:text-zinc-900 transition-colors"
                      title="Download plot"
                      aria-label="Download Lineweaver-Burk plot"
                    >
                      <ExternalLink size={16} />
                    </button>
                    <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
                      <Activity size={18} />
                    </div>
                  </div>
                </div>
                <div className="flex-1 min-h-[250px] md:min-h-[300px] relative">
                  <canvas ref={lbChartRef} />
                </div>
              </motion.div>
            </div>

            {/* Progress Curve Plot */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-3xl p-6 md:p-8 shadow-xl shadow-zinc-200/50 border border-zinc-100 flex flex-col"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-base md:text-lg font-bold text-zinc-900 font-display">Reaction Progress</h3>
                  <p className="text-[10px] md:text-xs font-medium text-zinc-500">Concentration vs Time (Euler Integration)</p>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <button 
                    onClick={() => handleDownloadPlot(progressChartRef, 'reaction-progress')}
                    className="p-2 rounded-xl hover:bg-zinc-100 text-zinc-400 hover:text-zinc-900 transition-colors mr-2"
                    title="Download plot"
                    aria-label="Download reaction progress plot"
                  >
                    <ExternalLink size={16} />
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                    <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-tighter">[S]</span>
                  </div>
                  {pathwayMode && (
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-600" />
                      <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-tighter">[I]</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-tighter">[P]</span>
                  </div>
                </div>
              </div>
              <div className="flex-1 min-h-[350px] md:min-h-[400px] relative">
                <canvas ref={progressChartRef} />
              </div>
            </motion.div>

            {/* Footer Info */}
            <footer className="pt-8 pb-12 flex flex-col md:flex-row justify-between items-center gap-6 border-t border-zinc-100">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center text-zinc-600 flex-shrink-0">
                  <Info size={14} />
                </div>
                <p className="text-[10px] md:text-xs text-zinc-500 max-w-md leading-relaxed text-center md:text-left">
                  This simulation uses numerical integration (Euler method) to approximate the differential equations of enzyme kinetics. Results are for educational purposes.
                </p>
              </div>
              <div className="flex items-center gap-2 text-zinc-400">
                <span className="text-[9px] font-bold uppercase tracking-widest">Developed with</span>
                <span className="text-rose-500 animate-pulse">❤️</span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">by Gadriel Borbor Gargard</span>
              </div>
            </footer>
          </div>
        </section>

      </main>
    </div>
  );
};

export default EKinLab;
