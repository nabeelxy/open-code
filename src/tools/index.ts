import type { Tool } from '../types.js'
import { bashTool } from './bash.js'
import { editTool } from './edit.js'
import { globTool } from './glob.js'
import { grepTool } from './grep.js'
import { readTool } from './read.js'
import { writeTool } from './write.js'

export function getAllTools(): Tool[] {
  return [bashTool, readTool, writeTool, editTool, globTool, grepTool]
}
