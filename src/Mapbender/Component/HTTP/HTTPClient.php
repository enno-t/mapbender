<?php

namespace Mapbender\Component\HTTP;

class HTTPClient {


    protected $method = "GET";
    protected $headers = array();
    protected $host = "";
    protected $port = "";
    protected $path = "";
    protected $proxyHost = "";
    protected $proxyPort = "";
    protected $username = "";

    protected $password = "";
    protected $container = "";
    protected $ch = null;
    

    public function __construct($container = null){
        $this->ch = curl_init();

        $proxyConf = null;
        if($this->container){
            try {
                $proxyConf = $this->container->getParameter('proxy');
            }catch(\InvalidArgumentException $E){
                // thrown when the parameter is not set
                // maybe some logging ?
                $proxyConf = array();
            }
            if($proxyConf && isset($proxyConf['host']) && $proxyConf['host'] != ""){
                $this->setProxyHost($proxyConf['host']);
                $this->setProxyPort($proxyConf['port']?:null);
            }
        }

    }
    public function __destruct(){
        $this->ch = curl_close($this->ch);
    }


    public function setProxyHost($host){
        $this->proxyHost = $host;
    }
    public function setProxyPort($port){
        $this->proxyPort = $port;
    }

    public function getUsername (){
        return $this->username ;
    }
    
    public function setUsername ($username ){
        $this->username  = $username ;
    }

    public function getPassword (){
        return $this->password ;
    }
    
    public function setPassword ($password ){
        $this->password  = $password ;
    }

    /**
     * Shortcut Method 
    */
    public function open($url,$query = array(),$method='GET', $data=''){
        curl_setopt($this->ch,CURLOPT_URL,$url);
        curl_setopt($this->ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($this->ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($this->ch, CURLINFO_HEADER_OUT, true);
        
        if($this->getUsername()){
            curl_setopt($this->ch, CURLOPT_HTTPAUTH, CURLAUTH_ANY);
            curl_setopt($this->ch, CURLOPT_USERPWD, $this->getUsername().":".$this->getPassword());
        }


        $data = curl_exec($this->ch);
        $statusCode = curl_getInfo($this->ch,CURLINFO_HTTP_CODE);

        $result = new HTTPResult();
        $result->setData($data);
        $result->setStatusCode($statusCode);
        return $result;
    }
}
