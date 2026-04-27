/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { Sidebar, Stepper } from './components/Navigation';
import { MainWorkspace } from './components/MainWorkspace';
import { AssetBank } from './components/AssetBank';
import { GenerationStep, StepState, GenerationConfig } from './types';
import { DEFAULT_CONFIGS } from './constants';
import { motion, AnimatePresence } from 'motion/react';

// Sample assets for the demo
const ASSETS = {
  floorplan: "https://images.unsplash.com/photo-1599809228533-43b0d903020c?auto=format&fit=crop&q=80&w=800",
  render3D: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=80&w=1200",
  axonometric: "https://images.unsplash.com/photo-1487958449913-d9229c99672e?auto=format&fit=crop&q=80&w=1200",
  refined: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=1200"
};

export default function App() {
  const [currentStep, setCurrentStep] = useState<GenerationStep>(GenerationStep.FloorplanTo3D);
  const [activeTab, setActiveTab] = useState('generate');
  
  const [stepStates, setStepStates] = useState<Record<GenerationStep, StepState>>({
    [GenerationStep.FloorplanTo3D]: {
      config: DEFAULT_CONFIGS[GenerationStep.FloorplanTo3D],
      inputImage: ASSETS.floorplan,
      outputImage: null,
      isGenerating: false,
      viewMode: 'original'
    },
    [GenerationStep.LocalInpainting]: {
      config: DEFAULT_CONFIGS[GenerationStep.LocalInpainting],
      inputImage: null,
      outputImage: null,
      isGenerating: false,
      viewMode: 'original'
    }
  });

  const handleUpdateConfig = useCallback((config: Partial<GenerationConfig>) => {
    setStepStates(prev => ({
      ...prev,
      [currentStep]: {
        ...prev[currentStep],
        config: { ...prev[currentStep].config, ...config }
      }
    }));
  }, [currentStep]);

  const simulateGeneration = useCallback(async () => {
    setStepStates(prev => ({
      ...prev,
      [currentStep]: { ...prev[currentStep], isGenerating: true }
    }));

    // Simulate AI processing time
    await new Promise(resolve => setTimeout(resolve, 2500));

    let resultImage = '';
    switch (currentStep) {
      case GenerationStep.FloorplanTo3D: resultImage = ASSETS.render3D; break;
      case GenerationStep.LocalInpainting: resultImage = ASSETS.refined; break;
    }

    setStepStates(prev => ({
      ...prev,
      [currentStep]: { 
        ...prev[currentStep], 
        outputImage: resultImage, 
        isGenerating: false,
        viewMode: 'after'
      }
    }));
  }, [currentStep]);

  const handleNextStep = useCallback(() => {
    const nextStep = currentStep + 1;
    if (nextStep <= 2) {
      // Pass the current output as the next step's input
      const currentOutput = stepStates[currentStep].outputImage;
      
      setStepStates(prev => ({
        ...prev,
        [nextStep]: {
          ...prev[nextStep as GenerationStep],
          inputImage: currentOutput
        }
      }));
      
      setCurrentStep(nextStep as GenerationStep);
    }
  }, [currentStep, stepStates]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-arch-bg text-white selection:bg-arch-accent selection:text-arch-bg">
      {/* Sidebar */}
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0">
        <AnimatePresence mode="wait">
          {activeTab === 'generate' ? (
            <motion.div 
              key="generate"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col min-w-0"
            >
              <Stepper currentStep={currentStep} onStepChange={setCurrentStep} />
              
              <div className="flex-1 relative overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentStep}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-0"
                  >
                    <MainWorkspace 
                      step={currentStep}
                      state={stepStates[currentStep]}
                      onUpdateConfig={handleUpdateConfig}
                      onGenerate={simulateGeneration}
                      onNextStep={handleNextStep}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
          ) : activeTab === 'assets' ? (
            <motion.div 
              key="assets"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1"
            >
              <AssetBank />
            </motion.div>
          ) : (
            <motion.div 
              key="fallback"
              className="flex-1 flex items-center justify-center text-slate-400 bg-slate-50"
            >
              正在开发中...
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

