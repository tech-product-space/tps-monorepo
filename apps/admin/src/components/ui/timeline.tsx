"use client";
import { useScroll, useTransform, motion } from "framer-motion";
import type React from "react";
import { useEffect, useRef, useState } from "react";

interface TimelineEntry {
  title: string;
  subtitle?: string;
  content: React.ReactNode;
}

export const Timeline = ({ data }: { data: TimelineEntry[] }) => {
  const ref = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setHeight(rect.height);
    }
  }, [ref]);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 10%", "end 50%"],
  });

  const heightTransform = useTransform(scrollYProgress, [0, 1], [0, height]);
  const opacityTransform = useTransform(scrollYProgress, [0, 0.1], [0, 1]);

  return (
    <div className="w-full bg-white font-sans md:px-10" ref={containerRef}>
      <div ref={ref} className="relative max-w-7xl mx-auto pb-20">
        {data.map((item, index) => (
          <div
            key={index}
            className="flex justify-start pt-10 md:pt-20 md:gap-10"
          >
            <div className="sticky flex flex-col md:flex-row z-40 items-center top-40 self-start max-w-xs lg:max-w-sm md:w-full">
              <div className="h-4 w-4 absolute left-2 md:left-2 rounded-full bg-white border-4 border-blue-500 flex items-center justify-center z-50"></div>
              <div className="hidden md:block md:pl-20">
                <h3 className="text-xl md:text-2xl font-semibold text-gray-900">
                  {item.title}
                </h3>
                {item.subtitle && (
                  <p className="text-gray-500 text-sm">{item.subtitle}</p>
                )}
              </div>
            </div>

            <div className="relative pl-20 pr-4 md:pl-4 w-full">
              <div className="md:hidden block mb-4">
                <h3 className="text-xl font-semibold text-gray-900">
                  {item.title}
                </h3>
                {item.subtitle && (
                  <p className="text-gray-500 text-sm">{item.subtitle}</p>
                )}
              </div>
              {item.content}
            </div>
          </div>
        ))}

        {/* Static background line */}
        <div
          style={{
            height: height + "px",
          }}
          className="absolute left-4 top-0 w-[2px] bg-gradient-to-b from-gray-50 via-gray-300 to-gray-50"
        />
      </div>
    </div>
  );
};
