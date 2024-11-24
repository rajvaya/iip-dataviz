const margin = { top: 40, right: 120, bottom: 60, left: 60 };
const width = 960 - margin.left - margin.right;
const height = 500 - margin.top - margin.bottom;

const svg = d3.select('#visualization')
  .append('svg')
  .attr('width', width + margin.left + margin.right)
  .attr('height', height + margin.top + margin.bottom)
  .append('g')
  .attr('transform', `translate(${margin.left},${margin.top})`);

// Add tooltip div to the body
const tooltip = d3.select('body').append('div')
  .attr('class', 'tooltip')
  .style('opacity', 0);

// Add info panel
const infoPanel = d3.select('#visualization')
  .append('div')
  .attr('class', 'info-panel')
  .html('<h3>Hover over elements to see details</h3>');

// Create separate groups for different layers
const barsGroup = svg.append('g').attr('class', 'bars-layer');
const lineGroup = svg.append('g').attr('class', 'line-layer');
const dotsGroup = svg.append('g').attr('class', 'dots-layer');

d3.csv('monthly_top5_analysis.csv').then(data => {
  // Filter only Label data
  const labelData = data.filter(d => d.Metric === 'Label');
  const monthOrder = ['january', 'february', 'march', 'april', 'may', 'june'];
  
  // Get unique labels
  const labels = [...new Set(labelData.map(d => d.Value))];
  
  // Calculate monthly totals for trend line
  const monthlyTotals = d3.rollup(labelData,
    v => d3.sum(v, d => +d.Count),
    d => d.Month
  );

  const processedTotals = Array.from(monthlyTotals, ([month, count]) => ({
    month: month,
    count: count
  })).sort((a, b) => monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month));

  // Create scales
  const xScale = d3.scaleBand()
    .domain(monthOrder)
    .range([0, width])
    .padding(0.1);

  const yScale = d3.scaleLinear()
    .domain([0, d3.max(processedTotals, d => d.count)])
    .range([height, 0])
    .nice();

  // Create color scale for labels
  const colorScale = d3.scaleOrdinal()
    .domain(labels)
    .range(d3.schemeSet3);

  // Create stacked bars
  const stackedData = d3.stack()
    .keys(labels)
    .value((d, key) => {
      const match = labelData.find(item => 
        item.Month === d.month && item.Value === key
      );
      return match ? +match.Count : 0;
    })
    (monthOrder.map(month => ({month})));

  // Create stacked bars in the bars group
  const bars = barsGroup.selectAll('g')
    .data(stackedData)
    .join('g')
    .attr('fill', d => colorScale(d.key))
    .selectAll('rect')
    .data(d => d)
    .join('rect')
    .attr('x', d => xScale(d.data.month))
    .attr('y', d => yScale(d[1]))
    .attr('height', d => yScale(d[0]) - yScale(d[1]))
    .attr('width', xScale.bandwidth())
    .style('opacity', 0.8)
    .on('mouseover', function(event, d) {
      const label = d3.select(this.parentNode).datum().key;
      const value = d[1] - d[0];
      
      // Highlight the bar
      d3.select(this)
        .style('opacity', 1)
        .style('stroke', '#000')
        .style('stroke-width', 2);

      // Bring the hovered bar to front
      this.parentNode.appendChild(this);

      // Show tooltip
      tooltip.transition()
        .duration(200)
        .style('opacity', .9);
      tooltip.html(`
        <strong>${label}</strong><br/>
        Month: ${d.data.month}<br/>
        Count: ${value}
      `)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 28) + 'px');

      updateInfoPanel(d.data.month, label, value);
    })
    .on('mouseout', function() {
      d3.select(this)
        .style('opacity', 0.8)
        .style('stroke', 'none');

      tooltip.transition()
        .duration(500)
        .style('opacity', 0);
    });

  // Add the trend line
  const line = d3.line()
    .x(d => xScale(d.month) + xScale.bandwidth()/2)
    .y(d => yScale(d.count))
    .curve(d3.curveCardinal);

  // Add the area under the line
  const area = d3.area()
    .x(d => xScale(d.month) + xScale.bandwidth()/2)
    .y0(height)
    .y1(d => yScale(d.count))
    .curve(d3.curveCardinal);

  // Add the area and line in the line group
  lineGroup.append('path')
    .datum(processedTotals)
    .attr('class', 'area')
    .attr('d', area)
    .attr('fill', 'rgba(0, 123, 255, 0.1)')
    .style('pointer-events', 'none'); // Make area ignore mouse events

  lineGroup.append('path')
    .datum(processedTotals)
    .attr('class', 'line')
    .attr('fill', 'none')
    .attr('stroke', '#007bff')
    .attr('stroke-width', 2)
    .attr('d', line)
    .style('pointer-events', 'none'); // Make line ignore mouse events

  // Enhanced dots with interactivity
  const dots = dotsGroup.selectAll('.dot-group')
    .data(processedTotals)
    .join('g')
    .attr('class', 'dot-group')
    .attr('transform', d => `translate(${xScale(d.month) + xScale.bandwidth()/2},${yScale(d.count)})`);

  dots.append('circle')
    .attr('class', 'dot')
    .attr('r', 5)
    .attr('fill', '#007bff')
    .on('mouseover', function(event, d) {
      // Highlight dot
      d3.select(this)
        .attr('r', 8)
        .style('fill', '#0056b3');

      // Show tooltip
      tooltip.transition()
        .duration(200)
        .style('opacity', .9);
      tooltip.html(`
        <strong>Total for ${d.month}</strong><br/>
        Count: ${d.count}
      `)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 28) + 'px');

      // Update info panel with monthly summary
      updateMonthSummary(d.month);
    })
    .on('mouseout', function() {
      d3.select(this)
        .attr('r', 5)
        .style('fill', '#007bff');
      
      tooltip.transition()
        .duration(500)
        .style('opacity', 0);
    });

  dots.append('text')
    .attr('y', -10)
    .attr('text-anchor', 'middle')
    .text(d => d.count)
    .style('font-size', '12px');

  // Add axes
  svg.append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(xScale))
    .selectAll('text')
    .style('text-transform', 'capitalize')
    .attr('transform', 'rotate(-45)')
    .attr('text-anchor', 'end');

  svg.append('g')
    .call(d3.axisLeft(yScale));

  // Enhanced legend with interactivity
  const legend = svg.append('g')
    .attr('class', 'legend')
    .attr('transform', `translate(${width + 10}, 0)`);

  const legendItems = legend.selectAll('g')
    .data(labels)
    .join('g')
    .attr('transform', (d, i) => `translate(0,${i * 20})`)
    .style('cursor', 'pointer')
    .on('mouseover', function(event, d) {
      // Highlight all bars for this label
      barsGroup.selectAll('rect')
        .style('opacity', 0.3);
      barsGroup.selectAll('g')
        .filter(g => g.key === d)
        .selectAll('rect')
        .style('opacity', 1);

      // Update info panel with label summary
      updateLabelSummary(d);
    })
    .on('mouseout', function() {
      barsGroup.selectAll('rect')
        .style('opacity', 0.8);
    });

  legendItems.append('rect')
    .attr('width', 10)
    .attr('height', 10)
    .attr('fill', d => colorScale(d));

  legendItems.append('text')
    .attr('x', 15)
    .attr('y', 9)
    .text(d => d)
    .style('font-size', '12px');

  // Add title
  svg.append('text')
    .attr('x', width / 2)
    .attr('y', -10)
    .attr('text-anchor', 'middle')
    .style('font-size', '16px')
    .text('Top 5 Labels Over Time');

  // Helper functions for info panel updates
  function updateInfoPanel(month, label, value) {
    const monthData = labelData.filter(d => d.Month === month);
    const total = d3.sum(monthData, d => +d.Count);
    const percentage = ((value / total) * 100).toFixed(1);

    infoPanel.html(`
      <h3>${month.charAt(0).toUpperCase() + month.slice(1)}</h3>
      <p><strong>${label}</strong></p>
      <p>Count: ${value}</p>
      <p>Percentage of month: ${percentage}%</p>
      <p>Monthly total: ${total}</p>
    `);
  }

  function updateMonthSummary(month) {
    const monthData = labelData.filter(d => d.Month === month);
    const total = d3.sum(monthData, d => +d.Count);
    
    const labelSummary = monthData
      .sort((a, b) => +b.Count - +a.Count)
      .map(d => `${d.Value}: ${d.Count} (${((+d.Count/total)*100).toFixed(1)}%)`)
      .join('<br/>');

    infoPanel.html(`
      <h3>${month.charAt(0).toUpperCase() + month.slice(1)} Summary</h3>
      <p>Total: ${total}</p>
      <p>Distribution:</p>
      ${labelSummary}
    `);
  }

  function updateLabelSummary(label) {
    const labelStats = labelData.filter(d => d.Value === label);
    const total = d3.sum(labelStats, d => +d.Count);
    const avg = (total / labelStats.length).toFixed(1);

    infoPanel.html(`
      <h3>${label}</h3>
      <p>Total appearances: ${total}</p>
      <p>Average per month: ${avg}</p>
      <p>Monthly breakdown:</p>
      ${labelStats.map(d => `${d.Month}: ${d.Count}`).join('<br/>')}
    `);
  }

  // Add CSS classes for proper layering
  svg.selectAll('.bars-layer rect')
    .style('pointer-events', 'all');
}); 