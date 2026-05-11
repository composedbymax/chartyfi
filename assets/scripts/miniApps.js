import {DataIntegrity} from './dataintegrity.js';
import {News} from './news.js';
import {URLLoader} from './urlLoader.js';
import {CycleDetector} from './cycleDetector.js';
const APPS=[
  DataIntegrity,
  News,
  URLLoader,
  CycleDetector,
];
export class MiniApps {
  constructor(chart,api){
    this.chart=chart;
    this.api=api;
    this._active=null;
    this._editorPom=null;
  }
  getApps(){return APPS;}
  open(AppClass,sidebar){
    if(AppClass.config?.suspendIndicators){
      this._editorPom=sidebar._editor._pom;
      this._editorPom.suspendAll();
    }
    this._active=new AppClass(this.chart,this.api);
    sidebar._openMiniApp(this._active);
  }
  close(){
    if(this._active&&this._active.destroy) this._active.destroy();
    this._active=null;
    if(this._editorPom){this._editorPom.restoreAll();this._editorPom=null;}
  }
}