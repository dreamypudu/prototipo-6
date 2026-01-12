import React, { useState, useEffect } from 'react';

interface SplashScreenProps {
  onStartGame: (name: string) => void;
}

// ==============================================================================
// INSTRUCCIONES: Reemplace la URL de abajo con el enlace a su propio logo.
// Se recomienda una imagen cuadrada (ej: 200x200 px) con fondo transparente.
// Ejemplo: 'https://i.imgur.com/69J15vd.png'
// ==============================================================================
const INNOVATEC_LOGO_URL = 'https://i.imgur.com/0w2fvoO.png'; // <- PEGUE LA URL DE SU LOGO AQUÍ

const SplashScreen: React.FC<SplashScreenProps> = ({ onStartGame }) => {
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isLoadingComplete, setIsLoadingComplete] = useState(false);
  const [playerName, setPlayerName] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => setIsLoadingComplete(true), 300); // Short delay before showing input
          return 100;
        }
        return prev + 1;
      });
    }, 20); // 20ms * 100 = 2000ms = 2 seconds loading time

    return () => clearInterval(interval);
  }, []);
  
  const handleStart = () => {
    if (playerName.trim()) {
        onStartGame(playerName.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900 flex flex-col items-center justify-center z-50 transition-opacity duration-500">
      <div className="text-center animate-fade-in w-full max-w-md">
        {/* Logo */}
        <div className="inline-block mb-8 animate-pulse-slow">
            <img src={INNOVATEC_LOGO_URL} alt="Innovatec Logo" className="w-80 h-80 object-contain" />
        </div>
        
        <h1 className="text-4xl font-bold text-white mb-2">COMPASS</h1>
        <p className="text-lg text-blue-300 mb-8">Simulador de Decisión: Gestión en Salud</p>
        
        {/* Loading Bar or Name Input */}
        <div className="w-full h-24 flex items-center justify-center">
            {!isLoadingComplete ? (
                <div className="w-full max-w-md mx-auto">
                    <div className="w-full bg-gray-700 rounded-full h-2.5">
                        <div 
                        className="bg-blue-500 h-2.5 rounded-full transition-all duration-150 ease-linear"
                        style={{ width: `${loadingProgress}%` }}
                        ></div>
                    </div>
                </div>
            ) : (
                <div className="w-full animate-fade-in-up">
                    <input
                        type="text"
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                        placeholder="Introduce tu nombre para comenzar"
                        className="w-full bg-gray-800 border-2 border-gray-600 text-white text-center text-lg px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                        onKeyPress={(e) => e.key === 'Enter' && handleStart()}
                    />
                    <button
                        onClick={handleStart}
                        disabled={!playerName.trim()}
                        className="mt-4 w-full bg-blue-600 text-white font-bold py-3 px-10 rounded-lg text-lg transition-all duration-300 ease-in-out transform hover:bg-blue-500 hover:scale-105 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed disabled:scale-100 shadow-lg hover:shadow-blue-500/50"
                        >
                        Iniciar Simulación
                    </button>
                </div>
            )}
        </div>
      </div>
       <style>{`
            @keyframes fade-in {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes fade-in-up {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
             @keyframes pulse-slow {
                0%, 100% {
                    transform: scale(1);
                    opacity: 1;
                }
                50% {
                    transform: scale(1.05);
                    opacity: 0.8;
                }
            }
            .animate-fade-in { animation: fade-in 1s ease-out forwards; }
            .animate-fade-in-up { animation: fade-in-up 0.5s ease-out forwards; }
            .animate-pulse-slow { animation: pulse-slow 3s infinite ease-in-out; }
        `}</style>
    </div>
  );
};

export default SplashScreen;