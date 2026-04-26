import React from 'react'

interface HRProps {
    color?: string
    fullWidth?: boolean 
    margin?: number
    style?: React.CSSProperties
}

const HR = (props: HRProps) => {
  return (
    <div style={{
        margin: props.margin !== undefined ? `${props.margin * 10}px 0` : '10px 0',
        width: props.fullWidth !== false ? '100%' : 'auto',
        height: '2px', // slightly thicker for initial testing
        minHeight: '2px', // prevents flexbox from collapsing the height to 0
        flexShrink: 0, 
        flexGrow: 1, // helps it stretch horizontally in a flex row
        backgroundColor: props.color || 'darkred',
        ...props.style
        }}>

    </div>
  )
}

export default HR