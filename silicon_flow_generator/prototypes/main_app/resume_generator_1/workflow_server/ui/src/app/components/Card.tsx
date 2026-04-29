import React, { CSSProperties } from 'react'

interface CardProps {
    style?: CSSProperties,
    children: React.ReactNode,
    className?: string
}

const Card = (props: CardProps) => {
  return (
    <div
      className={`${props.className}`}
      style={{
        padding: '4px 12px',
        zIndex: 1,
        backgroundColor: 'rgba(255,255,255,0.04)',
        position: 'relative',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.1)',
        ...props.style
      }}
      >
        {props.children}
    </div>
  )
}

export default Card