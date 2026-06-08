#include "iostream"
#include "string"
#include "unistd.h"
#include "sys/socket.h"
#include "netinet/in.h"
#include "arpa/inet.h"

const static std::string HOST_IP = "0.0.0.0";
// #define INADDR_ANY ((in_addr_t)0x00000000)

int main()
{
    // socket → bind → listen → accept → 收发数据
    // int socket(int domain, int type, int protocol);
    //
    //     domain：协议族
    //     AF_INET：IPv4 协议（最常用）
    //     AF_INET6：IPv6 协议
    //     type：传输类型
    //     SOCK_STREAM：TCP 流式传输（必选）
    //     SOCK_DGRAM：UDP 数据报
    //     protocol：协议编号，填 0 即可（自动匹配 TCP/UDP） IPPROTO_TCP
    //     返回值：成功返回非负整数（socket 文件描述符），失败返回 -1。
    //
    // 1.创建网络套接字
    int socketfd = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    int ret = -1;
    if (socketfd == -1)
    {
        perror("socket 创建失败");
        goto END;
    }

    // 2.创建地址结构体
    struct sockaddr_in addr;
    // struct sockaddr_in
    // {
    //     sa_family_t sin_family;  // 协议族：AF_INET
    //     in_port_t sin_port;      // 端口号（必须用 htons() 转字节序）
    //     struct in_addr sin_addr; // IP 地址
    //     char sin_zero[8];        // 填充字节，全设为 0
    // };
    // addr.sin_addr.s_addr = inet_addr("0.0.0.0");
    // inet_aton(" 0.0.0.0 ", &addr.sin_addr); // 监听所有的网卡 const char*
    addr.sin_addr.s_addr = htonl(INADDR_ANY);
    addr.sin_family = AF_INET;
    addr.sin_port = htons(8090);
    // host to network short  uin16 专门给端口用
    // host to network long ulong32 IP 用
    // in_addr_t inet_addr(const char *cp);
    // 作用：字符串 IP → 网络字节序 IP
    // 无法处理 255.255.255.255（会返回 -1，被当成错误）
    // 现代写法：int inet_aton(const char *cp, struct in_addr *inp);
    // char *inet_ntoa(struct in_addr in);

    // 3.bind
    ret = bind(socketfd, (const sockaddr *)&addr, sizeof(addr));
    if (ret < 0)
    {
        perror("bind error");
        goto END;
    }
    // int bind(int sockfd, const struct sockaddr *addr, socklen_t addrlen);
    // 作用：将 socket 绑定到指定 IP + 端口，让客户端能找到服务端。
    // 参数：
    // sockfd：socket() 创建的文件描述符 addr   实际使用 sockaddr_in（IPv4 专用），最后强转为 sockaddr *
    // addrlen：addr 结构体的大小（sizeof(sockaddr_in)）
    // 返回值：成功 0，失败 - 1。

    // 4. 开始监听
    ret = listen(socketfd, 5);
    if (ret < 0)
    {
        perror("listen error");
        goto END;
    }
    // int listen(int sockfd, int backlog);
    // 作用：将 socket 设为被动监听模式，等待客户端连接。
    // 参数：
    // sockfd：socket 文件描述符
    // backlog：等待连接队列的最大长度（一般填 5、10、128 即可）
    //  已经完成三次握手 但服务端还没调用 accept() 就会在内核中排队

    // 5.accept
    while (1)
    {
        int newfd = accept(socketfd, NULL, 0);
        // int accept(int sockfd, struct sockaddr *addr, socklen_t *addrlen);
        // 作用：阻塞等待客户端连接，连接成功后返回新的 socket 描述符（专门用于和该客户端通信）。
        // 参数：
        // sockfd：监听用的 socket
        // addr：输出参数，存储客户端的 IP 和端口
        // addrlen：输入输出参数，传入结构体大小，返回实际大小
        // 返回值：成功返回新的通信 socket，失败返回 -1。

        if (newfd < 0)
        {
            perror("accept error");
            goto END;
        }
        char buf[1024] = {0};
        ret = recv(newfd, buf, 1024, 0);
        if (ret < 0)
        {
            perror("recv error");
            close(newfd);
            continue;
        }
        else if (ret == 0)
        {
            perror("peer shutdown!");
            close(newfd);
            continue;
        }

        std::string body = "<html><body><h1>Hello World</h1></body></html>";

        std::string rsp = "HTTP/1.1 200 OK\r\n";
        rsp += "Content-Length: " + std::to_string(body.size()) + "\r\n";
        rsp += "Content-Type: text/html\r\n";

        rsp += "\r\n";
        rsp += body;

        // HTTP/1.1 200 OK\r\n               ← 状态行
        // Content - Type : text / html\r\n       ← 响应头  多行 ，顺序不影响
        // Content - Length : 38\r\n   body size
        // Connection : close\r\n
        // \r\n     ← 空行
        // <html><body> Hello</ body></ html>   ← 响应体

        ret = send(newfd, rsp.c_str(), rsp.size(), 0);
        if (ret < 0)
        {
            perror("send error!");
            close(newfd);
            continue;
        }
        close(newfd);

        // ssize_t send(int sockfd, const void *buf, size_t len, int flags);
        // 作用：向对端发送数据。
        // 参数：
        // sockfd：通信 socket
        // buf：要发送的数据缓冲区
        // len：数据长度
        // flags：标志位，填 0 即可
        // 返回值：成功返回发送的字节数，失败返回 -1。
    }
    // 连接的客服端断开，accept就会出错，然后正常关闭
    ret = 0;
END:
    close(socketfd);
    return ret;
}
