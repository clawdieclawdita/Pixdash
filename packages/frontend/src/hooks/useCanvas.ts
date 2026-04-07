import { useEffect, useRef } from 'react';

export const useCanvas = (draw: (deltaMs: number) => void) => {
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const drawRef = useRef(draw);

  drawRef.current = draw;

  useEffect(() => {
    const loop = (time: number) => {
      const previous = lastTimeRef.current ?? time;
      const delta = time - previous;
      lastTimeRef.current = time;
      drawRef.current(delta);
      frameRef.current = window.requestAnimationFrame(loop);
    };

    frameRef.current = window.requestAnimationFrame(loop);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      lastTimeRef.current = null;
    };
  }, []);
};
