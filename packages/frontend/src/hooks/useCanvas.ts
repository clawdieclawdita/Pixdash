import { useEffect, useRef } from 'react';

export const useCanvas = (draw: (deltaMs: number) => void) => {
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const loop = (time: number) => {
      const previous = lastTimeRef.current ?? time;
      const delta = time - previous;
      lastTimeRef.current = time;
      draw(delta);
      frameRef.current = window.requestAnimationFrame(loop);
    };

    frameRef.current = window.requestAnimationFrame(loop);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      lastTimeRef.current = null;
    };
  }, [draw]);
};
