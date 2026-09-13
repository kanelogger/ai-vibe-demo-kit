# Environment commands

按任务从 `project.yml#commands` 读取命令。运行前确认命令、工作目录、依赖、权限和网络要求；`not-applicable` 项不得执行。每项命令记录证据、退出码、产生的资源及必要清理。

建议记录：`command_id`、`command_ref`、`cwd`、`profiles`、`requires`、`network`、`approval`、`side_effects`、`timeout_seconds`、`success_exit_codes`、`verify`、`cleanup`。
