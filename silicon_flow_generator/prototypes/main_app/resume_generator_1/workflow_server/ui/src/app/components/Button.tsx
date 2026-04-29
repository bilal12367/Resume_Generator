import React, { useState } from 'react'

interface ButtonProps {
    bgColor?: string
    padding?: string
    onClick?: () => void
    text: string
    icon?: React.ReactNode
    className?: string
    style?: React.CSSProperties
    variant?: 'solid' | 'card'
}

const Button = (props: ButtonProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const isCard = props.variant === 'card';
  const glowColor = props.bgColor || 'rgba(255, 255, 255, 0.2)';

  return (
    <div
        className={props.className}
        onClick={props.onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
            padding: props.padding || '12px 20px',
            backgroundColor: props.bgColor,
            borderRadius: 50,
            cursor: 'pointer',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.3s ease',
            transform: isHovered ? 'scale(1.05)' : 'scale(1)',
            // boxShadow: isHovered ? `0 0 15px ${props.bgColor}` : 'none',
            boxShadow: isHovered ? `0 0 15px ${glowColor}` : 'none',
            ...(isCard ? {
                padding: props.padding || '12px 20px',
                zIndex: 1,
                backgroundColor: 'rgba(255,255,255,0.04)',
                position: 'relative',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.1)',
            } : {
                padding: props.padding || '12px 20px',
                backgroundColor: props.bgColor,
                borderRadius: 50,
            }),
            ...props.style
        }}
        >
        {props.icon && <div style={{ display: 'flex' }}>{props.icon}</div>}
        <span className={props.className}>{props.text}</span>
    </div>
  )
}

export default Button