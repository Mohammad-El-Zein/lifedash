import {
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  effect,
  inject,
  input,
} from '@angular/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import type { EChartsCoreOption } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  PieChart,
  BarChart,
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);

/** Thin ECharts wrapper: pass a full option object; handles init/resize/dispose. */
@Component({
  selector: 'app-echart',
  template: '',
  host: { style: 'display: block; width: 100%; height: 100%;' },
})
export class EchartComponent implements OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly option = input.required<EChartsCoreOption>();

  private chart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    afterNextRender(() => {
      this.chart = echarts.init(this.host.nativeElement);
      this.chart.setOption(this.option());
      this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
      this.resizeObserver.observe(this.host.nativeElement);
    });
    effect(() => {
      const option = this.option();
      this.chart?.setOption(option, true);
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
  }
}
