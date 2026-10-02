"use client";

import { CheckIcon } from "@heroicons/react/24/solid";

interface Step {
  id: number;
  label: string;
}

interface RegistrationStepperProps {
  steps: Step[];
  currentStep: number;
  className?: string;
}

export default function RegistrationStepper({
  steps,
  currentStep,
  className = "",
}: RegistrationStepperProps) {
  const totalSteps = steps.length;
  const progressPercent = ((currentStep - 1) / (totalSteps - 1)) * 100;

  return (
    <div className={`flex flex-col items-center w-full ${className}`}>
      <div className="w-full max-w-xl">
        <div className="relative flex items-center justify-between mb-4">
          <div className="absolute top-1/2 left-0 right-0 -translate-y-1/2 px-6">
            <div className="h-0 border-t-[3px] border-dashed border-slate-300/70 w-full"></div>
          </div>

          {steps.map((step) => {
            const isCompleted = step.id < currentStep;
            const isCurrent = step.id === currentStep;

            return (
              <div key={step.id} className="relative z-10 flex flex-col items-center group">
                <div
                  className={`
                    w-11 h-11 rounded-full flex items-center justify-center
                    transition-all duration-300 border-[3px]
                    ${
                      isCompleted
                        ? "bg-blue-800 border-blue-800 text-white shadow-lg"
                        : isCurrent
                        ? "bg-blue-800 border-blue-800 text-white shadow-lg"
                        : "bg-white border-slate-300 text-slate-400"
                    }
                  `}
                >
                  {isCompleted ? (
                    <CheckIcon className="w-5 h-5" />
                  ) : (
                    <span className="text-base font-bold">{step.id}</span>
                  )}
                </div>
                
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                  <div className="bg-slate-800 text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
                    {step.label}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="relative h-1 bg-slate-300 rounded-full">
          <div
            className="absolute top-0 left-0 h-full bg-blue-800 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
          <div 
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-blue-800 rounded-full border-2 border-white shadow-md transition-all duration-500 ease-out"
            style={{ left: `calc(${progressPercent}% - 6px)` }}
          />
        </div>
      </div>
    </div>
  );
}
