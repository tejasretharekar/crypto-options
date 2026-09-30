import React, { useState, useEffect, useRef, useCallback } from 'react';

export default function DrawingOverlay({
  chartInstance,
  seriesInstance,
  activeTool,
  setActiveTool,
  activeColor,
  lineStyle,
  drawings,
  setDrawings,
  displayUnit = 'USD',
  containerRef,
}) {
  const [renderTick, setRenderTick] = useState(0);
  const [hoveredDrawingId, setHoveredDrawingId] = useState(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState(null);

  // State for active in-progress segment drawing
  const [segmentStart, setSegmentStart] = useState(null);
  const [mousePos, setMousePos] = useState(null);

  // Re-render trigger on chart scroll, zoom, or resize
  useEffect(() => {
    if (!chartInstance) return;

    const handleRangeChange = () => {
      setRenderTick((t) => t + 1);
    };

    const timeScale = chartInstance.timeScale();
    timeScale.subscribeVisibleLogicalRangeChange(handleRangeChange);
    timeScale.subscribeVisibleTimeRangeChange(handleRangeChange);

    return () => {
      try {
        timeScale.unsubscribeVisibleLogicalRangeChange(handleRangeChange);
        timeScale.unsubscribeVisibleTimeRangeChange(handleRangeChange);
      } catch (e) {
        // Ignore during unmount
      }
    };
  }, [chartInstance]);

  // Handle keyboard Delete / Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSegmentStart(null);
        setSelectedDrawingId(null);
        if (activeTool !== 'cursor') setActiveTool('cursor');
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawingId) {
        setDrawings((prev) => prev.filter((d) => d.id !== selectedDrawingId));
        setSelectedDrawingId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool, selectedDrawingId, setActiveTool, setDrawings]);

  // Coordinate conversion helpers
  const getChartCoordinates = useCallback(
    (clientX, clientY) => {
      if (!containerRef?.current || !chartInstance || !seriesInstance) return null;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      const price = seriesInstance.coordinateToPrice(y);
      const time = chartInstance.timeScale().coordinateToTime(x);
      const logical = chartInstance.timeScale().coordinateToLogical(x);

      return { x, y, price, time, logical, rectWidth: rect.width, rectHeight: rect.height };
    },
    [containerRef, chartInstance, seriesInstance]
  );

  const projectPrice = useCallback(
    (price) => {
      if (!seriesInstance) return null;
      return seriesInstance.priceToCoordinate(price);
    },
    [seriesInstance]
  );

  const projectTimeOrLogical = useCallback(
    (time, logical) => {
      if (!chartInstance) return null;
      const timeScale = chartInstance.timeScale();
      if (time !== null && time !== undefined) {
        const coord = timeScale.timeToCoordinate(time);
        if (coord !== null) return coord;
      }
      if (logical !== null && logical !== undefined) {
        return timeScale.logicalToCoordinate(logical);
      }
      return null;
    },
    [chartInstance]
  );

  // Mouse event handlers for interactive drawing
  const handleMouseMove = (e) => {
    const coords = getChartCoordinates(e.clientX, e.clientY);
    if (!coords) return;
    setMousePos(coords);
  };

  const handleMouseLeave = () => {
    setMousePos(null);
  };

  const handleOverlayClick = (e) => {
    // If clicking an existing line or delete button, let its handler handle it
    if (e.target.dataset?.drawingElement) return;

    const coords = getChartCoordinates(e.clientX, e.clientY);
    if (!coords || coords.price === null || coords.price === undefined) return;

    if (activeTool === 'hline') {
      // Place horizontal line at current price
      const newHLine = {
        id: 'hline_' + Date.now(),
        type: 'hline',
        price: coords.price,
        color: activeColor,
        style: lineStyle,
      };
      setDrawings((prev) => [...prev, newHLine]);
    } else if (activeTool === 'segment') {
      if (!segmentStart) {
        // First point of segment
        setSegmentStart({
          price: coords.price,
          time: coords.time,
          logical: coords.logical,
          x: coords.x,
          y: coords.y,
        });
      } else {
        // Second point of segment - complete line
        const newSegment = {
          id: 'seg_' + Date.now(),
          type: 'segment',
          p1: {
            price: segmentStart.price,
            time: segmentStart.time,
            logical: segmentStart.logical,
          },
          p2: {
            price: coords.price,
            time: coords.time,
            logical: coords.logical,
          },
          color: activeColor,
          style: lineStyle,
        };
        setDrawings((prev) => [...prev, newSegment]);
        setSegmentStart(null);
      }
    } else if (activeTool === 'cursor') {
      setSelectedDrawingId(null);
    }
  };

  const handleDeleteDrawing = (e, id) => {
    e.stopPropagation();
    setDrawings((prev) => prev.filter((d) => d.id !== id));
    if (selectedDrawingId === id) setSelectedDrawingId(null);
  };

  const handleLineClick = (e, id) => {
    e.stopPropagation();
    setSelectedDrawingId(id);
  };

  const formatPrice = (price) => {
    if (price === null || price === undefined || isNaN(price)) return '';
    if (displayUnit === 'USD') {
      return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `${price.toFixed(4)}`;
  };

  const isDrawingActive = activeTool === 'hline' || activeTool === 'segment';
  const containerRect = containerRef?.current?.getBoundingClientRect();
  const width = containerRect?.width || 800;
  const height = containerRect?.height || 450;

  return (
    <div
      className={`drawing-overlay ${isDrawingActive ? 'interactive' : 'passive'}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: isDrawingActive ? 'all' : 'none',
        zIndex: 5,
        cursor: isDrawingActive ? 'crosshair' : 'default',
        overflow: 'hidden',
      }}
      onClick={handleOverlayClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <svg
        width="100%"
        height="100%"
        style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
      >
        {/* Render Saved Drawings */}
        {drawings.map((d) => {
          const isHovered = hoveredDrawingId === d.id;
          const isSelected = selectedDrawingId === d.id;
          const strokeWidth = isSelected ? 2.5 : isHovered ? 2 : 1.5;
          const strokeDash = d.style === 'dashed' ? '5 4' : 'none';

          if (d.type === 'hline') {
            const y = projectPrice(d.price);
            if (y === null || y < -20 || y > height + 20) return null;

            return (
              <g
                key={d.id}
                className="drawing-item hline-group"
                style={{ pointerEvents: 'all' }}
                onMouseEnter={() => setHoveredDrawingId(d.id)}
                onMouseLeave={() => setHoveredDrawingId(null)}
                onClick={(e) => handleLineClick(e, d.id)}
                data-drawing-element="true"
              >
                {/* Invisible thicker stroke for easy clicking/hovering */}
                <line
                  x1={0}
                  y1={y}
                  x2={width}
                  y2={y}
                  stroke="transparent"
                  strokeWidth={14}
                  data-drawing-element="true"
                />
                {/* Visible Horizontal Line */}
                <line
                  x1={0}
                  y1={y}
                  x2={width}
                  y2={y}
                  stroke={d.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={strokeDash}
                  data-drawing-element="true"
                />

                {/* Price Badge on Right Margin */}
                <g transform={`translate(${Math.max(10, width - 95)}, ${y - 11})`}>
                  <rect
                    x={0}
                    y={0}
                    width={90}
                    height={22}
                    rx={4}
                    fill="#0f172a"
                    stroke={d.color}
                    strokeWidth={isSelected ? 1.5 : 1}
                    opacity={0.92}
                    data-drawing-element="true"
                  />
                  <text
                    x={45}
                    y={15}
                    fill={d.color}
                    fontSize={11}
                    fontWeight="600"
                    textAnchor="middle"
                    fontFamily="monospace"
                    data-drawing-element="true"
                  >
                    {formatPrice(d.price)}
                  </text>
                </g>

                {/* Delete Button on Hover / Selection */}
                {(isHovered || isSelected) && (
                  <g
                    transform={`translate(${Math.max(10, width - 120)}, ${y - 10})`}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => handleDeleteDrawing(e, d.id)}
                    data-drawing-element="true"
                  >
                    <circle cx={10} cy={10} r={9} fill="#ef4444" opacity={0.9} data-drawing-element="true" />
                    <text
                      x={10}
                      y={13.5}
                      fill="#ffffff"
                      fontSize={11}
                      fontWeight="bold"
                      textAnchor="middle"
                      data-drawing-element="true"
                    >
                      ×
                    </text>
                  </g>
                )}
              </g>
            );
          }

          if (d.type === 'segment') {
            const x1 = projectTimeOrLogical(d.p1.time, d.p1.logical);
            const y1 = projectPrice(d.p1.price);
            const x2 = projectTimeOrLogical(d.p2.time, d.p2.logical);
            const y2 = projectPrice(d.p2.price);

            if (x1 === null || y1 === null || x2 === null || y2 === null) return null;

            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;

            return (
              <g
                key={d.id}
                className="drawing-item segment-group"
                style={{ pointerEvents: 'all' }}
                onMouseEnter={() => setHoveredDrawingId(d.id)}
                onMouseLeave={() => setHoveredDrawingId(null)}
                onClick={(e) => handleLineClick(e, d.id)}
                data-drawing-element="true"
              >
                {/* Hit target line */}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="transparent"
                  strokeWidth={16}
                  data-drawing-element="true"
                />
                {/* Visible segment line */}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={d.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={strokeDash}
                  data-drawing-element="true"
                />
                {/* End Point Handles */}
                <circle
                  cx={x1}
                  y1={y1}
                  r={isSelected ? 4.5 : 3.5}
                  fill={d.color}
                  stroke="#0f172a"
                  strokeWidth={1.5}
                  data-drawing-element="true"
                />
                <circle
                  cx={x2}
                  y2={y2}
                  r={isSelected ? 4.5 : 3.5}
                  fill={d.color}
                  stroke="#0f172a"
                  strokeWidth={1.5}
                  data-drawing-element="true"
                />

                {/* Delete button at midpoint on hover/select */}
                {(isHovered || isSelected) && (
                  <g
                    transform={`translate(${midX - 10}, ${midY - 10})`}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => handleDeleteDrawing(e, d.id)}
                    data-drawing-element="true"
                  >
                    <circle cx={10} cy={10} r={9} fill="#ef4444" opacity={0.9} data-drawing-element="true" />
                    <text
                      x={10}
                      y={13.5}
                      fill="#ffffff"
                      fontSize={11}
                      fontWeight="bold"
                      textAnchor="middle"
                      data-drawing-element="true"
                    >
                      ×
                    </text>
                  </g>
                )}
              </g>
            );
          }

          return null;
        })}

        {/* Live Preview when drawing Horizontal Line */}
        {activeTool === 'hline' && mousePos && mousePos.price !== null && (
          <g className="live-preview-hline">
            <line
              x1={0}
              y1={mousePos.y}
              x2={width}
              y2={mousePos.y}
              stroke={activeColor}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              opacity={0.8}
            />
            <g transform={`translate(${Math.max(10, width - 110)}, ${mousePos.y - 12})`}>
              <rect x={0} y={0} width={105} height={24} rx={4} fill="#1e293b" stroke={activeColor} strokeWidth={1} />
              <text x={52} y={16} fill={activeColor} fontSize={11} fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                Click: {formatPrice(mousePos.price)}
              </text>
            </g>
          </g>
        )}

        {/* Live Preview when drawing Line Segment */}
        {activeTool === 'segment' && segmentStart && mousePos && (
          <g className="live-preview-segment">
            <line
              x1={segmentStart.x}
              y1={segmentStart.y}
              x2={mousePos.x}
              y2={mousePos.y}
              stroke={activeColor}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              opacity={0.85}
            />
            <circle cx={segmentStart.x} cy={segmentStart.y} r={4} fill={activeColor} stroke="#0f172a" strokeWidth={1.5} />
            <circle cx={mousePos.x} cy={mousePos.y} r={4} fill={activeColor} stroke="#0f172a" strokeWidth={1.5} />
          </g>
        )}
      </svg>

      {/* Floating Prompt Helper */}
      {activeTool === 'hline' && (
        <div className="drawing-help-pill">Click anywhere on chart to place full-width horizontal price line</div>
      )}
      {activeTool === 'segment' && !segmentStart && (
        <div className="drawing-help-pill">Click first point to start line segment</div>
      )}
      {activeTool === 'segment' && segmentStart && (
        <div className="drawing-help-pill">Move mouse and click second point to finish line segment (Esc to cancel)</div>
      )}
    </div>
  );
}
