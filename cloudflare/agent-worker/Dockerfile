FROM docker.io/cloudflare/sandbox:0.8.9

# 必备工具：
# - git, openssh-client：Git 数据源节点 git clone
# - rsync：构建末步把 /source 同步到挂载的 R2
# - curl, ca-certificates：通用网络
# - jq：脚本节点常用
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        openssh-client \
        rsync \
        curl \
        ca-certificates \
        jq \
    && rm -rf /var/lib/apt/lists/*
