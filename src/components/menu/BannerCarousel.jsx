import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function BannerCarousel({ banners = [] }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!banners || banners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev === banners.length - 1 ? 0 : prev + 1));
    }, 5000);
    return () => clearInterval(interval);
  }, [banners]);

  if (!banners || banners.length === 0) return null;

  const nextSlide = () => setCurrentIndex((i) => (i === banners.length - 1 ? 0 : i + 1));
  const prevSlide = () => setCurrentIndex((i) => (i === 0 ? banners.length - 1 : i - 1));

  const currentBanner = banners[currentIndex];

  return (
    <div className="w-full relative overflow-hidden bg-white">
      <div 
        className="relative w-full overflow-hidden rounded-t-[18px] sm:rounded-t-[20px] aspect-[16/10] sm:aspect-[16/9] md:aspect-[2.4/1] bg-white"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="absolute inset-0 select-none"
          >
            <img
              src={currentBanner?.image_url}
              alt={currentBanner?.title || "Banner"}
              className="w-full h-full object-cover"
              draggable={false}
            />
          </motion.div>
        </AnimatePresence>

        {banners.length > 1 && (
          <>
            <button
              onClick={prevSlide}
              className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 items-center justify-center rounded-full text-white bg-black/40 hover:bg-black/70 backdrop-blur-md border border-white/10 transition-all shadow-md z-20 cursor-pointer"
              aria-label="Banner anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={nextSlide}
              className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 items-center justify-center rounded-full text-white bg-black/40 hover:bg-black/70 backdrop-blur-md border border-white/10 transition-all shadow-md z-20 cursor-pointer"
              aria-label="Próximo banner"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Indicadores centralizados na base do banner (posicionados acima da sobreposição da folha branca) */}
            <div className="absolute bottom-9 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-20 pointer-events-auto">
              {banners.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentIndex(index)}
                  className="rounded-full transition-all duration-300 cursor-pointer shadow-xs"
                  style={{
                    width: index === currentIndex ? '22px' : '6px',
                    height: '6px',
                    background: index === currentIndex ? '#ffffff' : 'rgba(255,255,255,0.45)',
                  }}
                  aria-label={`Ir para banner ${index + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}