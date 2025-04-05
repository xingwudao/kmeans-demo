import { useState, useEffect, useRef } from 'react'
import * as d3 from 'd3'
import './KMeans.css'

interface DataPoint {
  Average_Weekly_Study_Hours: number
  Average_Sleep_Hours_Per_Night: number
  cluster?: number
}

interface NormalizedDataPoint {
  x: number  // 归一化后的学习时间
  y: number  // 归一化后的睡眠时间
  cluster?: number
}

interface Centroid {
  x: number
  y: number
  cluster: number
}

const KMeans = () => {
  const svgRef = useRef<SVGSVGElement>(null)
  const [originalData, setOriginalData] = useState<DataPoint[]>([])  // 原始数据
  const [normalizedData, setNormalizedData] = useState<NormalizedDataPoint[]>([])  // 归一化后的数据
  const [centroids, setCentroids] = useState<Centroid[]>([])
  const [k, setK] = useState(4)
  const [isRunning, setIsRunning] = useState(false)
  const [iteration, setIteration] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 从CSV文件加载数据
  useEffect(() => {
    d3.csv<DataPoint>('/data/data.csv', (d) => ({
      Average_Weekly_Study_Hours: +d.Average_Weekly_Study_Hours,
      Average_Sleep_Hours_Per_Night: +d.Average_Sleep_Hours_Per_Night,
    }))
    .then(loadedData => {
      setOriginalData(loadedData)
      setIsLoading(false)
    })
    .catch(() => {
      setError('数据加载失败')
      setIsLoading(false)
    })
  }, [])

  // Min-Max归一化数据
  const normalizeData = (data: DataPoint[]): NormalizedDataPoint[] => {
    const hours = data.map(d => d.Average_Weekly_Study_Hours)
    const sleep = data.map(d => d.Average_Sleep_Hours_Per_Night)
    const maxHours = Math.max(...hours)
    const maxSleep = Math.max(...sleep)

    return data.map(d => ({
      x: d.Average_Weekly_Study_Hours / maxHours,
      y: d.Average_Sleep_Hours_Per_Night / maxSleep,
    }))
  }

  // 初始化聚类中心
  const initializeCentroids = (normalizedPoints: NormalizedDataPoint[]): Centroid[] => {
    const shuffled = [...normalizedPoints].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, k).map((point, i) => ({
      x: point.x,
      y: point.y,
      cluster: i
    }))
  }

  // 计算两点之间的欧氏距离
  const distance = (p1: { x: number, y: number }, p2: { x: number, y: number }) => {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2))
  }

  // 分配数据点到最近的聚类中心
  const assignClusters = (points: NormalizedDataPoint[], centroids: Centroid[]): NormalizedDataPoint[] => {
    return points.map(point => {
      const distances = centroids.map(centroid => distance(point, centroid))
      const nearestCentroid = distances.indexOf(Math.min(...distances))
      return { ...point, cluster: nearestCentroid }
    })
  }

  // 更新聚类中心
  const updateCentroids = (points: NormalizedDataPoint[], oldCentroids: Centroid[]): Centroid[] => {
    return oldCentroids.map((centroid, i) => {
      const clusterPoints = points.filter(p => p.cluster === i)
      if (clusterPoints.length === 0) return centroid

      const newX = clusterPoints.reduce((sum, p) => sum + p.x, 0) / clusterPoints.length
      const newY = clusterPoints.reduce((sum, p) => sum + p.y, 0) / clusterPoints.length
      
      return {
        x: newX,
        y: newY,
        cluster: i
      }
    })
  }

  // 计算聚类中心的变化程度
  const calculateCentroidChange = (oldCentroids: Centroid[], newCentroids: Centroid[]) => {
    return oldCentroids.reduce((maxChange, oldC, i) => {
      const newC = newCentroids[i]
      const change = distance(oldC, newC)
      return Math.max(maxChange, change)
    }, 0)
  }

  // 开始聚类
  const startClustering = () => {
    setIsRunning(true)
    setIteration(0)

    // 归一化数据
    const normalized = normalizeData(originalData)
    setNormalizedData(normalized)

    // 初始化聚类中心
    const initialCentroids = initializeCentroids(normalized)
    setCentroids(initialCentroids)

    // 分配初始聚类
    const initialClustering = assignClusters(normalized, initialCentroids)
    setNormalizedData(initialClustering)

    // 更新原始数据的聚类标签
    const updatedOriginalData = originalData.map((point, i) => ({
      ...point,
      cluster: initialClustering[i].cluster
    }))
    setOriginalData(updatedOriginalData)
    
    const interval = setInterval(() => {
      setIteration(prev => {
        if (prev >= 20) {
          clearInterval(interval)
          setIsRunning(false)
          return prev
        }
        
        setCentroids(prevCentroids => {
          // 使用归一化数据进行聚类计算
          const newNormalizedData = assignClusters(normalizedData, prevCentroids)
          const newCentroids = updateCentroids(newNormalizedData, prevCentroids)
          
          // 检查聚类中心的变化
          const maxChange = calculateCentroidChange(prevCentroids, newCentroids)
          if (maxChange < 0.001) {
            clearInterval(interval)
            setIsRunning(false)
            return prevCentroids
          }

          // 更新归一化数据的聚类标签
          setNormalizedData(newNormalizedData)

          // 更新原始数据的聚类标签
          const updatedOriginalData = originalData.map((point, i) => ({
            ...point,
            cluster: newNormalizedData[i].cluster
          }))
          setOriginalData(updatedOriginalData)

          return newCentroids
        })
        
        return prev + 1
      })
    }, 500)
  }

  // 绘制散点图
  useEffect(() => {
    if (!svgRef.current || !originalData.length) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = 600
    const height = 400
    const padding = 40

    // 设置比例尺
    const xScale = d3.scaleLinear()
      .domain([0, 40])
      .range([padding, width - padding])

    const yScale = d3.scaleLinear()
      .domain([0, 12])
      .range([height - padding, padding])

    // 颜色比例尺
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10)

    // 绘制坐标轴
    svg.append('g')
      .attr('transform', `translate(0,${height - padding})`)
      .call(d3.axisBottom(xScale))

    svg.append('g')
      .attr('transform', `translate(${padding},0)`)
      .call(d3.axisLeft(yScale))

    // 添加坐标轴标签
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', height - 5)
      .attr('text-anchor', 'middle')
      .text('每周学习时间（小时）')

    svg.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -height / 2)
      .attr('y', 15)
      .attr('text-anchor', 'middle')
      .text('每晚睡眠时间（小时）')

    // 绘制数据点
    const dataPoints = svg.append('g')
      .attr('class', 'data-points')
    
    dataPoints.selectAll('circle.data-point')
      .data(originalData)
      .join(
        enter => enter.append('circle')
          .attr('class', 'data-point')
          .attr('cx', d => xScale(d.Average_Weekly_Study_Hours))
          .attr('cy', d => yScale(d.Average_Sleep_Hours_Per_Night))
          .attr('r', 2.5)
          .attr('fill', d => d.cluster !== undefined ? colorScale(d.cluster.toString()) : 'none')
          .attr('stroke', d => d.cluster !== undefined ? colorScale(d.cluster.toString()) : '#000')
          .attr('stroke-width', 1.5),
        update => update
          .attr('cx', d => xScale(d.Average_Weekly_Study_Hours))
          .attr('cy', d => yScale(d.Average_Sleep_Hours_Per_Night))
          .attr('fill', d => d.cluster !== undefined ? colorScale(d.cluster.toString()) : 'none')
          .attr('stroke', d => d.cluster !== undefined ? colorScale(d.cluster.toString()) : '#000')
      )

    // 绘制聚类中心
    if (centroids.length > 0) {
      const maxHours = Math.max(...originalData.map(d => d.Average_Weekly_Study_Hours))
      const maxSleep = Math.max(...originalData.map(d => d.Average_Sleep_Hours_Per_Night))

      const centroids_g = svg.append('g')
        .attr('class', 'centroids')
      
      centroids_g.selectAll('circle.centroid')
        .data(centroids)
        .join(
          enter => enter.append('circle')
            .attr('class', 'centroid')
            .attr('cx', d => xScale(d.x * maxHours))
            .attr('cy', d => yScale(d.y * maxSleep))
            .attr('r', 5)
            .attr('fill', d => colorScale(d.cluster.toString()))
            .attr('stroke', '#000')
            .attr('stroke-width', 2)
            .attr('fill-opacity', 0.7)
            .style('animation', 'breathe 1s ease-in-out infinite'),
          update => update
            .attr('cx', d => xScale(d.x * maxHours))
            .attr('cy', d => yScale(d.y * maxSleep))
            .attr('fill', d => colorScale(d.cluster.toString()))
        )
    }
  }, [originalData, centroids])

  if (isLoading) {
    return <div className="loading">加载中...</div>
  }

  if (error) {
    return <div className="error">{error}</div>
  }

  return (
    <div className="kmeans">
      <div className="controls">
        <div className="input-group">
          <label>聚类数量（K）：</label>
          <input
            type="number"
            value={k}
            onChange={(e) => setK(Math.max(2, Math.min(10, +e.target.value)))}
            min="2"
            max="10"
            disabled={isRunning}
          />
        </div>
        <button onClick={startClustering} disabled={isRunning}>
          {isRunning ? `迭代中... (${iteration}/20)` : '开始聚类'}
        </button>
      </div>
      <div className="visualization">
        <svg
          ref={svgRef}
          width={600}
          height={400}
        />
      </div>
    </div>
  )
}

export default KMeans 