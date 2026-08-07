import React from 'react';
import { Landmark, Camera, Utensils, Map, Church, Compass } from 'lucide-react';

interface AttractionImageProps {
  src?: string;
  alt: string;
  category: string;
  className?: string;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  monumenti: <Landmark className="w-10 h-10 text-white opacity-60" />,
  chiese: <Church className="w-10 h-10 text-white opacity-60" />,
  musei: <Landmark className="w-10 h-10 text-white opacity-60" />,
  panorami: <Camera className="w-10 h-10 text-white opacity-60" />,
  locali: <Utensils className="w-10 h-10 text-white opacity-60" />,
  utilita: <Map className="w-10 h-10 text-white opacity-60" />,
  default: <Compass className="w-10 h-10 text-white opacity-60" />
};

const CATEGORY_GRADIENTS: Record<string, string> = {
  monumenti: "bg-gradient-to-br from-amber-600/30 to-amber-700/50",
  chiese: "bg-gradient-to-br from-blue-600/30 to-blue-700/50",
  musei: "bg-gradient-to-br from-indigo-600/30 to-indigo-700/50",
  panorami: "bg-gradient-to-br from-emerald-600/30 to-emerald-700/50",
  locali: "bg-gradient-to-br from-rose-600/30 to-rose-700/50",
  utilita: "bg-gradient-to-br from-slate-600/30 to-slate-700/50",
  default: "bg-gradient-to-br from-emerald-600/20 to-[#1e3a8a]/40"
};

const FALLBACK_IMAGES: Record<string, string> = {
  monumenti: "https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&q=80&w=400",
  chiese: "https://images.unsplash.com/photo-1548625361-ec85381a179f?auto=format&fit=crop&q=80&w=400",
  musei: "https://images.unsplash.com/photo-1582555172866-f73bb12a2ab3?auto=format&fit=crop&q=80&w=400",
  panorami: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=400",
  locali: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&q=80&w=400",
  utilita: "https://images.unsplash.com/photo-1573101823912-70b04bc540f2?auto=format&fit=crop&q=80&w=400",
  default: "https://images.unsplash.com/photo-1522083111811-0985223abac3?auto=format&fit=crop&q=80&w=400"
};

export default function AttractionImage({ src, alt, category, className = "" }: AttractionImageProps) {
  const [error, setError] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [fallbackError, setFallbackError] = React.useState(false);

  // Normalize category
  const cat = (category || 'default').toLowerCase();
  let normCat = 'default';
  if (cat.includes('monument') || cat === 'monumenti' || cat === 'gemme') normCat = 'monumenti';
  else if (cat.includes('chies') || cat === 'chiese') normCat = 'chiese';
  else if (cat.includes('museo') || cat === 'musei') normCat = 'musei';
  else if (cat.includes('ristorante') || cat.includes('cibo') || cat === 'locali' || cat.includes('gelateria') || cat.includes('bar') || cat.includes('pizzeria')) normCat = 'locali';
  else if (cat.includes('parco') || cat.includes('natura') || cat.includes('giardin') || cat === 'panorami') normCat = 'panorami';
  else if (cat === 'utilita' || cat === 'utilità') normCat = 'utilita';

  const getFallbackImage = () => FALLBACK_IMAGES[normCat] || FALLBACK_IMAGES.default;
  const getGradientClass = () => CATEGORY_GRADIENTS[normCat] || CATEGORY_GRADIENTS.default;
  const getIcon = () => CATEGORY_ICONS[normCat] || CATEGORY_ICONS.default;

  // Render a clean gradient placeholder if there is no image source or it's a generic placeholder
  const isFakeImage = src && src.includes('placehold.co');
  
  if (error || !src || isFakeImage) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`relative overflow-hidden ${getGradientClass()} flex flex-col items-center justify-center p-4 text-center ${className}`}
      >
        {/* Render a beautiful centered icon with subtle animation */}
        <div className="p-5 bg-white/10 rounded-full backdrop-blur-md border border-white/20 shadow-2xl hover:scale-110 transition-all duration-500 group">
          <div className="text-white/90 group-hover:text-white drop-shadow-md transition-colors duration-300">
            {getIcon()}
          </div>
        </div>
        {/* Add elegant atmospheric lighting */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.15),transparent_60%)] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(0,0,0,0.2),transparent_60%)] pointer-events-none" />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${getGradientClass()} flex items-center justify-center ${className}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/10 backdrop-blur-sm animate-pulse z-10">
          <div className="p-3 bg-white/10 rounded-full border border-white/10">
            {getIcon()}
          </div>
        </div>
      )}
      
      <img
        src={src}
        alt={alt}
        className={`w-full h-full object-cover transition-opacity duration-500 ${loading ? 'opacity-0' : 'opacity-100'}`}
        onError={() => setError(true)}
        onLoad={() => setLoading(false)}
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
