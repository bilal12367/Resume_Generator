import React, { useId } from 'react';

const GlowDot = ({ 
  color = '#22c55e', 
  speed = '2s', 
  size = '7px',
  glowIntensity = '8px',
  style = {}
}) => {
  // Generate a unique ID so multiple dots don't conflict
  const id = useId().replace(/:/g, "");
  const animName = `anim_${id}`;
  const className = `dot_${id}`;

  // We define the CSS string entirely in JS
  const dynamicKeyframes = `
    .${className} {
      position: relative;
      border-radius: 50%;
      width: ${size};
      height: ${size};
      background-color: ${color};
      display: inline-block;
    }
    .${className}::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      border-radius: 50%;
      animation: ${animName} ${speed} infinite ease-out;
    }
    @keyframes ${animName} {
      0% { 
        box-shadow: 0 0 0 0 ${color};
        opacity: 1;
      }
      100% { 
        box-shadow: 0 0 0 ${glowIntensity} ${color};
        opacity: 0;
      }
    }
  `;

  return (
    <>
      <style>{dynamicKeyframes}</style>
      <div style={{...style}} className={className} />
    </>
  );
};

export default GlowDot;