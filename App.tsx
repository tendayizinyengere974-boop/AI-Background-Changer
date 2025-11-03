import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from 'react-image-crop';


// --- Utility function to get cropped image data ---
function getCroppedImg(image: HTMLImageElement, crop: PixelCrop): Promise<string> {
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    canvas.width = crop.width;
    canvas.height = crop.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        return Promise.reject(new Error('Failed to get 2D context'));
    }

    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = crop.width * pixelRatio;
    canvas.height = crop.height * pixelRatio;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
        image,
        crop.x * scaleX,
        crop.y * scaleY,
        crop.width * scaleX,
        crop.height * scaleY,
        0,
        0,
        crop.width,
        crop.height
    );

    return new Promise((resolve) => {
        resolve(canvas.toDataURL('image/png'));
    });
}


// --- SVG Icon Components ---

const UploadIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);

const SparklesIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-6.857 2.143L12 21l-2.143-6.857L3 12l6.857-2.143L12 3z" />
    </svg>
);

const ImageIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
);

const DownloadIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
);

const CropIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 21v-3.5c0-1.1.9-2 2-2h11.5M18 3v3.5c0 1.1-.9 2-2 2H5" />
    </svg>
);

const InfoIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const CloseIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
);

const InstallIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
);

// --- Constants ---

const loadingMessages = [
    "Warming up the AI's creativity...",
    "Analyzing your photo's pixels...",
    "Painting the new background scene...",
    "Adding realistic lighting and shadows...",
    "Blending everything together seamlessly...",
    "Final touches... almost there!",
];

const realismLevels = {
    standard: { name: 'Standard', prompt: 'Replace the background of the image with: "{prompt}". Isolate the subject cleanly.'},
    enhanced: { name: 'Enhanced', prompt: 'Photorealistically replace the background with: "{prompt}". Isolate the subject and match the lighting direction and basic shadows.'},
    ultra: { name: 'Ultra', prompt: `Your task is a master-level, VFX-quality photorealistic background replacement. The final image must be indistinguishable from a photograph shot with a high-end DSLR camera. Adhere to the following professional VFX pipeline:

1.  **Alpha Matting & Edge Refinement:**
    *   Execute a perfect, high-fidelity segmentation of the primary subject.
    *   Generate a soft, precise alpha matte. Pay microscopic attention to fine details: individual hair strands, fabric textures, semi-transparent materials (e.g., glass, thin fabric), and motion blur on edges. The matte should be anti-aliased and feathered naturally.

2.  **Background Generation (Physics-Based):**
    *   Create the new background based on this description: "{prompt}".
    *   The background must be physically accurate, considering the laws of optics. Ensure realistic depth of field, lens distortion, and subtle chromatic aberration consistent with a specific type of camera lens.

3.  **3D Integration & PBR Lighting (CRITICAL):**
    *   **Light Source Analysis:** Identify all primary, secondary, and ambient light sources in the generated background. Analyze their color temperature (Kelvin), intensity, and direction.
    *   **Subject Re-lighting:** Treat the subject as a 3D object. Apply a physically-based rendering (PBR) lighting model. The subject must receive light and cast shadows accurately from *all* identified sources.
    *   **Shadows:** Generate ultra-realistic soft shadows with accurate penumbras. Include subtle contact shadows where the subject meets surfaces. Shadows must inherit color from the ambient light.
    *   **Global Illumination & Color Bleed:** Simulate bounced light. The subject must pick up subtle color reflections (color bleed) from nearby surfaces in the new environment. For example, a subject standing on green grass should have a faint green tint on their downward-facing surfaces.

4.  **Final Compositing & Color Grading:**
    *   **Atmospheric Integration:** Blend the subject with any atmospheric effects in the scene (e.g., fog, haze, volumetric light). The subject's contrast and color saturation should decrease slightly with distance, matching the scene's atmospherics.
    *   **Color Harmony:** Apply professional-level color grading across the entire image (subject and background) to unify them under a single, cohesive color palette. Match the black levels, white points, and mid-tones perfectly.
    *   **Camera Effects:** Introduce a subtle, realistic film grain or sensor noise consistently across the entire image. Ensure the sharpness and focus of the subject perfectly match the background's depth of field.

5.  **Quality Control:**
    *   Scan the final image for any compositing artifacts, hard edges, or lighting inconsistencies. The final output must be a single, flawless, photorealistic image.`},
};

type RealismLevel = keyof typeof realismLevels;

// --- Main App Component ---

export default function App() {
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [originalFileName, setOriginalFileName] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isGettingIdeas, setIsGettingIdeas] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>(loadingMessages[0]);
  const [realismLevel, setRealismLevel] = useState<RealismLevel>('ultra');
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [isInfoModalOpen, setIsInfoModalOpen] = useState<boolean>(false);
  const [installPromptEvent, setInstallPromptEvent] = useState<any>(null);
  const imgRef = useRef<HTMLImageElement>(null);


  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
        event.preventDefault();
        setInstallPromptEvent(event);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isLoading) {
      interval = setInterval(() => {
        setLoadingMessage(prevMessage => {
          const currentIndex = loadingMessages.indexOf(prevMessage);
          const nextIndex = (currentIndex + 1) % loadingMessages.length;
          return loadingMessages[nextIndex];
        });
      }, 2500);
    } else {
      setLoadingMessage(loadingMessages[0]);
    }
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isLoading]);

  const handleImageChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setOriginalFileName(file.name);
      setGeneratedImage(null);
      setError(null);
      setOriginalImage(null);
      setCrop(undefined);
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result as string);
        // Also set the original image directly to bypass mandatory crop
        setOriginalImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);
  
  const handleApplyCrop = useCallback(async () => {
    if (completedCrop && imgRef.current) {
        try {
            const croppedImageUrl = await getCroppedImg(imgRef.current, completedCrop);
            setOriginalImage(croppedImageUrl);
            setUploadedImage(null); // Hide cropper
        } catch (e) {
            console.error(e);
            setError("Could not crop the image. Please try again.");
        }
    }
  }, [completedCrop]);

  const handleCancelCrop = useCallback(() => {
    setUploadedImage(null);
    // Keep original image if crop is cancelled
  }, []);
  
  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
    const newCrop = centerCrop(
        makeAspectCrop({ unit: '%', width: 90 }, 1, width, height),
        width,
        height
    );
    setCrop(newCrop);
    setCompletedCrop(undefined);
}

const handleInstallClick = () => {
    if (installPromptEvent) {
        installPromptEvent.prompt();
        installPromptEvent.userChoice.then((choiceResult: { outcome: string }) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('User accepted the install prompt');
            } else {
                console.log('User dismissed the install prompt');
            }
            setInstallPromptEvent(null);
        });
    }
};

  const handleGetPromptIdeas = async () => {
    if (!prompt) return;
    setIsGettingIdeas(true);
    setError(null);
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Enhance this simple scene description into a single, highly detailed and photorealistic prompt for an AI image generator. Focus on lighting, atmosphere, and specific details. Do not add any conversational text, just return the enhanced prompt.
            
            SIMPLE DESCRIPTION: "${prompt}"
            
            ENHANCED PROMPT:`,
        });
        setPrompt(response.text.trim());
    } catch (err) {
        setError(err instanceof Error ? `Error getting ideas: ${err.message}` : "Could not get ideas. Please try again.");
    } finally {
        setIsGettingIdeas(false);
    }
  };

  const handleGenerate = async () => {
    if (!originalImage || !prompt) return;

    setIsLoading(true);
    setError(null);
    setGeneratedImage(null);

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const base64Data = originalImage.split(',')[1];
        const mimeType = originalImage.match(/data:(.*);base64,/)?.[1];

        if (!mimeType) {
            throw new Error("Could not determine image type from data URL.");
        }

        const imagePart = {
            inlineData: { data: base64Data, mimeType },
        };

        const textPart = {
            text: realismLevels[realismLevel].prompt.replace('{prompt}', prompt),
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [imagePart, textPart] },
            config: { responseModalities: [Modality.IMAGE] },
        });
        
        const newImagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData && p.inlineData.mimeType.startsWith('image/'));
        
        if (newImagePart?.inlineData) {
            setGeneratedImage(`data:image/png;base64,${newImagePart.inlineData.data}`);
        } else {
            throw new Error("The AI did not return an image. Please try a different prompt or image.");
        }

    } catch (err) {
        console.error(err);
        setError(err instanceof Error ? `Error: ${err.message}` : "An unknown error occurred during generation.");
    } finally {
        setIsLoading(false);
    }
  };
  
  const handleDownload = () => {
    if (!generatedImage) return;

    const link = document.createElement('a');
    link.href = generatedImage;
    
    let downloadName = 'ai-generated-background.png';
    if (originalFileName) {
        const nameWithoutExtension = originalFileName.split('.').slice(0, -1).join('.');
        downloadName = `${nameWithoutExtension}_background_changed.png`;
    }
    link.download = downloadName;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const isCropping = !!uploadedImage && !!originalImage;

  const isGenerateButtonDisabled = useMemo(() => !originalImage || !prompt || isLoading, [originalImage, prompt, isLoading]);

  if (isCropping) {
    return (
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-lg z-50 flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-4xl bg-gray-800 rounded-xl border border-gray-700 shadow-2xl p-6 flex flex-col">
                <h2 className="text-2xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-500 mb-4">Crop Your Image</h2>
                <p className="text-center text-gray-400 mb-6">Drag and resize the box to select the area you want to keep.</p>
                <div className="flex justify-center bg-gray-900/50 p-4 rounded-lg mb-6 overflow-hidden">
                    <ReactCrop
                        crop={crop}
                        onChange={c => setCrop(c)}
                        onComplete={c => setCompletedCrop(c)}
                        aspect={1}
                        className="max-h-[60vh]"
                    >
                        <img ref={imgRef} src={uploadedImage} alt="To crop" onLoad={onImageLoad} style={{ maxHeight: '60vh' }} />
                    </ReactCrop>
                </div>
                <div className="flex justify-center gap-4">
                    <button onClick={handleCancelCrop} className="px-6 py-2 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-500 transition-colors">Cancel</button>
                    <button 
                        onClick={handleApplyCrop} 
                        className="flex items-center justify-center gap-2 px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold rounded-lg shadow-lg hover:shadow-purple-500/50 transform hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!completedCrop?.width || !completedCrop?.height}
                    >
                        <CropIcon className="w-5 h-5" />
                        Apply Crop
                    </button>
                </div>
            </div>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 font-sans">
      <header className="bg-gray-800/50 backdrop-blur-sm p-4 border-b border-gray-700 relative">
        <h1 className="text-2xl md:text-3xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-500">
          Dreamscape AI
        </h1>
        <p className="text-center text-gray-400 mt-1">Your Photos, Any Reality.</p>
        <div className="absolute top-1/2 -translate-y-1/2 right-4 flex items-center gap-4">
            {installPromptEvent && (
                <button 
                    onClick={handleInstallClick} 
                    className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-500 transition-colors text-sm"
                    aria-label="Install App"
                    title="Install Dreamscape AI to your device"
                >
                    <InstallIcon className="w-5 h-5" />
                    <span className="hidden sm:inline">Install App</span>
                </button>
            )}
            <button onClick={() => setIsInfoModalOpen(true)} className="text-gray-400 hover:text-white transition-colors" aria-label="About this app">
                <InfoIcon className="w-6 h-6" />
            </button>
        </div>
      </header>
      
      {isInfoModalOpen && (
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-lg z-50 flex items-center justify-center p-4" onClick={() => setIsInfoModalOpen(false)}>
            <div className="w-full max-w-2xl bg-gray-800 rounded-xl border border-gray-700 shadow-2xl p-6 flex flex-col relative" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setIsInfoModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors" aria-label="Close">
                    <CloseIcon className="w-6 h-6" />
                </button>
                <h2 className="text-2xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-500 mb-4">
                    About Dreamscape AI
                </h2>
                <div className="text-gray-300 space-y-4 text-left max-h-[70vh] overflow-y-auto pr-4">
                    <p>Unleash the ultimate creative power over your photos with Dreamscape AI, the revolutionary app that transforms your ordinary backgrounds into extraordinary, hyper-realistic scenes based purely on your imagination.</p>
                    <p>Ever wished you were standing on the fiery plains of hell, exploring an alien jungle, or simply gazing at a serene mountain vista? With Dreamscape AI, it's not just possible – it looks incredibly real. Our cutting-edge Artificial Intelligence effortlessly identifies and separates you from your original photo, then seamlessly generates and blends a brand new, stunningly detailed background that perfectly matches your wildest descriptions.</p>
                    <div>
                        <h3 className="font-semibold text-lg text-purple-300 mb-2">How it Works:</h3>
                        <ul className="list-disc list-inside space-y-2">
                            <li><span className="font-bold">Upload Your Photo:</span> Choose any picture from your gallery.</li>
                            <li><span className="font-bold">Describe Your Dream Scene:</span> Simply type what you envision – "a cyberpunk city at night," "an ancient, misty forest with glowing fungi," or "the surface of Mars at sunset."</li>
                            <li><span className="font-bold">Witness the Magic:</span> Our advanced AI instantly creates a photorealistic background, matching lighting, shadows, and perspective to make it look like you were truly there.</li>
                        </ul>
                    </div>
                    <div>
                        <h3 className="font-semibold text-lg text-purple-300 mb-2">Key Features:</h3>
                        <ul className="list-disc list-inside space-y-2">
                            <li><span className="font-bold">Hyper-Realistic AI Generation:</span> Groundbreaking technology delivers backgrounds so convincing, your friends will swear you traveled there.</li>
                            <li><span className="font-bold">Infinite Possibilities:</span> From fantastical realms to real-world locations, if you can describe it, we can create it.</li>
                            <li><span className="font-bold">Seamless Integration:</span> Flawless blending ensures natural lighting, shadows, and depth for a truly authentic look.</li>
                            <li><span className="font-bold">Easy-to-Use Interface:</span> Simple upload and text-based description make creativity accessible to everyone.</li>
                            <li><span className="font-bold">High-Resolution Output:</span> Save and share your masterpieces in stunning detail.</li>
                        </ul>
                    </div>
                    <p className="pt-4 text-center text-gray-400">Stop just taking photos – start creating entire worlds.</p>
                </div>
            </div>
        </div>
      )}
      
      <main className="p-4 md:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-7xl mx-auto">
          
          <div className="flex flex-col gap-6 p-6 bg-gray-800 rounded-xl border border-gray-700 shadow-lg">
            <div>
              <label className="text-lg font-semibold mb-2 block text-gray-300">1. Upload Your Photo</label>
              <div className="relative border-2 border-dashed border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-purple-500 hover:bg-gray-700/50 transition-colors">
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
                  onChange={handleImageChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  aria-label="Upload photo"
                />
                <div className="flex flex-col items-center justify-center space-y-3">
                    <UploadIcon className="w-10 h-10 text-gray-500" />
                    <p className="text-gray-400"><span className="font-semibold text-purple-400">Click to upload</span> or drag and drop</p>
                    <p className="text-xs text-gray-500">PNG, JPG, WEBP</p>
                </div>
              </div>
            </div>
            
            <div>
              <label htmlFor="prompt" className="text-lg font-semibold mb-2 block text-gray-300">2. Describe the New Background</label>
              <div className="relative">
                <textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g., a futuristic cityscape at night..."
                  rows={4}
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-shadow outline-none resize-none pr-28"
                />
                <button 
                    onClick={handleGetPromptIdeas} 
                    disabled={isGettingIdeas || !prompt}
                    className="absolute top-1/2 -translate-y-1/2 right-2 flex items-center gap-1.5 text-xs px-3 py-1.5 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Let AI enhance your prompt"
                >
                    {isGettingIdeas ? (
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    ) : (
                        <SparklesIcon className="w-4 h-4" />
                    )}
                    Get Ideas
                </button>
              </div>
            </div>
            
            <div>
                <label className="text-lg font-semibold mb-3 block text-gray-300">3. Choose Realism Level</label>
                <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(realismLevels) as RealismLevel[]).map(level => (
                        <button
                            key={level}
                            onClick={() => setRealismLevel(level)}
                            className={`p-3 text-center rounded-lg border-2 transition-all font-semibold ${realismLevel === level ? 'bg-purple-600 border-purple-400 text-white shadow-lg' : 'bg-gray-700 border-gray-600 hover:border-purple-500'}`}
                        >
                           {realismLevels[level].name}
                        </button>
                    ))}
                </div>
            </div>

            <button
                onClick={handleGenerate}
                disabled={isGenerateButtonDisabled}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold rounded-lg shadow-lg hover:shadow-purple-500/50 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transform hover:scale-105 transition-all duration-300 mt-2"
            >
                {isLoading ? (<><svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Generating...</>) 
                : (<><SparklesIcon className="w-6 h-6" />Generate</>)}
            </button>
          </div>

          <div className="flex flex-col gap-6 p-6 bg-gray-800 rounded-xl border border-gray-700 shadow-lg min-h-[400px]">
            <h2 className="text-lg font-semibold text-center text-gray-300">Results</h2>
            
            {error && (<div className="flex items-center justify-center h-full p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-center" role="alert">{error}</div>)}
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 h-full">
                <div className="flex flex-col items-center justify-center text-center p-2 bg-gray-700/50 rounded-lg relative">
                    <h3 className="text-md font-medium text-gray-400 mb-2">Original</h3>
                    {originalImage ? (
                        <>
                          <img src={originalImage} alt="Original upload" className="w-full h-auto object-contain rounded-md max-h-96"/>
                          <button 
                            onClick={() => setUploadedImage(originalImage)}
                            className="absolute top-2 right-2 bg-gray-900/50 text-white p-2 rounded-full hover:bg-gray-900 transition-colors"
                            title="Crop Image"
                          >
                              <CropIcon className="w-5 h-5"/>
                          </button>
                        </>
                    ) : (
                        <div className="w-full h-64 flex flex-col items-center justify-center bg-gray-700 rounded-md">
                           <ImageIcon className="w-16 h-16 text-gray-500 mb-2" />
                           <p className="text-gray-500">Upload an image to start</p>
                        </div>
                    )}
                </div>

                <div className="flex flex-col items-center justify-start text-center p-2 bg-gray-700/50 rounded-lg">
                    <h3 className="text-md font-medium text-gray-400 mb-2">Generated</h3>
                    <div className="w-full h-full min-h-64 flex flex-col items-center justify-center bg-gray-700 rounded-md relative">
                      {isLoading ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-800/70 backdrop-blur-sm rounded-md z-10 p-4" aria-live="polite">
                            <svg className="animate-spin h-10 w-10 text-purple-400 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            <p className="text-purple-300 font-semibold text-center">{loadingMessage}</p>
                            <p className="text-sm text-gray-400 mt-1">This may take a moment.</p>
                        </div>
                      ) : generatedImage ? (
                          <img src={generatedImage} alt="AI Generated" className="w-full h-auto object-contain rounded-md max-h-96"/>
                      ) : (
                        <div className="flex flex-col items-center justify-center">
                          <SparklesIcon className="w-16 h-16 text-gray-500 mb-2" />
                          <p className="text-gray-500 text-center px-4">Your new image will appear here</p>
                        </div>
                      )}
                    </div>
                    {generatedImage && !isLoading && (
                        <button
                            onClick={handleDownload}
                            className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-teal-500 text-white font-bold rounded-lg shadow-lg hover:shadow-green-500/50 transform hover:scale-105 transition-all duration-300"
                        >
                            <DownloadIcon className="w-5 h-5" />
                            Download Image
                        </button>
                    )}
                </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}